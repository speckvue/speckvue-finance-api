import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import AppLogger from '../../common/logging/app-logger.service';
import PrismaService from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import CategoriesService from '../categories/categories.service';
import { assertAccountBalances } from '../ledger/account-balances';
import PayeesService from '../payees/payees.service';
import type {
  TransactionCreateInput,
  TransactionInput,
  TransactionsQuery,
  TransactionUpdateInput,
} from './transactions.dto';

const include = {
  account: true,
  payee: { include: { mergedInto: true } },
  splits: { orderBy: { position: 'asc' }, include: { category: true } },
} as const;
type Row = Prisma.ManualTransactionGetPayload<{ include: typeof include }>;
const limit = new Prisma.Decimal('999999999999999.9999');

/** Serializes owner mutations before validating assignments and computing exact ledger balances. */
@Injectable()
class TransactionsService {
  constructor(
    private readonly db: PrismaService,
    private readonly categories: CategoriesService,
    private readonly payees: PayeesService,
    private readonly logger: AppLogger,
  ) {}
  private async lock(tx: Prisma.TransactionClient, userId: string) {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
    if (!rows.length) throw new NotFoundException();
  }
  private async owned(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
  ) {
    const row = await tx.manualTransaction.findFirst({
      where: { userId, id },
      include,
    });
    if (!row) throw new NotFoundException('Transaction not found');
    return row;
  }
  private serialize(row: Row) {
    const payee = row.payee?.mergedInto ?? row.payee;
    return {
      id: row.id,
      accountId: row.accountId,
      accountName: row.account.name,
      accountArchived: row.account.archivedAt !== null,
      currency: row.account.currency,
      payeeId: row.payeeId,
      payeeName: payee?.name ?? null,
      kind: row.kind,
      amount: row.amount.toFixed(4),
      date: row.date.toISOString().slice(0, 10),
      notes: row.notes,
      revision: row.revision,
      deletedAt: row.deletedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      splits: row.splits.map((s) => ({
        categoryId: s.categoryId,
        categoryName: s.category?.name ?? null,
        amount: s.amount.toFixed(4),
      })),
    };
  }
  private async prepare(
    tx: Prisma.TransactionClient,
    userId: string,
    dto: TransactionInput,
    previous?: Row,
  ) {
    const account = await tx.financialAccount.findFirst({
      where: { userId, id: dto.accountId },
    });
    if (!account) throw new NotFoundException('Account not found');
    if (previous && previous.account.currency !== account.currency)
      throw new ConflictException(
        'A transaction can only move between accounts with the same currency',
      );
    if (account.archivedAt || previous?.account.archivedAt)
      throw new ConflictException(
        'Restore the account before changing its transactions',
      );
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const dateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: user.timezone ?? 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const parts = Object.fromEntries(dateParts.map((p) => [p.type, p.value]));
    const today = `${parts.year}-${parts.month}-${parts.day}`;
    if (
      dto.date > today ||
      dto.date < account.openingBalanceDate.toISOString().slice(0, 10)
    )
      throw new BadRequestException(
        'Choose a date between the opening balance date and today',
      );
    const digits = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: account.currency,
    }).resolvedOptions().maximumFractionDigits!;
    const money = (value: string) => {
      const amount = new Prisma.Decimal(value);
      if (!amount.gt(0) || amount.gt(limit) || amount.decimalPlaces() > digits)
        throw new BadRequestException(
          'Use a positive amount within the account currency precision',
        );
      return amount;
    };
    const amount = money(dto.amount);
    let sum = new Prisma.Decimal(0);
    const categoryKind = dto.kind === 'income' ? 'income' : 'expense';
    const seen = new Set<string>();
    const splits = [];
    for (const [position, input] of dto.splits.entries()) {
      const categoryId = input.categoryId ?? null;
      const key = categoryId ?? 'uncategorized';
      if (seen.has(key))
        throw new BadRequestException('Combine duplicate category lines');
      seen.add(key);
      if (categoryId) {
        const retained =
          previous &&
          (previous.kind === 'income' ? 'income' : 'expense') ===
            categoryKind &&
          previous.splits.some((s) => s.categoryId === categoryId);
        if (!retained)
          await this.categories.requireAssignable(
            tx,
            userId,
            categoryId,
            categoryKind,
          );
      }
      const splitAmount = money(input.amount);
      sum = sum.plus(splitAmount);
      splits.push({
        userId,
        categoryId,
        categoryKind,
        amount: splitAmount,
        position,
      });
    }
    if (!sum.eq(amount))
      throw new BadRequestException(
        'Split amounts must equal the transaction total',
      );
    let payeeId = dto.payeeId ?? null;
    if (payeeId && payeeId !== previous?.payeeId)
      payeeId = (await this.payees.requireAssignable(tx, userId, payeeId)).id;
    const notes = dto.notes?.normalize('NFKC').trim() || null;
    if (
      notes &&
      (notes.length > 2000 ||
        Array.from(notes).some(
          (c) => /\p{Cc}/u.test(c) && !'\n\r\t'.includes(c),
        ))
    )
      throw new BadRequestException('Invalid notes');
    return {
      accountId: account.id,
      payeeId,
      kind: dto.kind,
      amount,
      date: new Date(dto.date + 'T00:00:00.000Z'),
      notes,
      splits,
    };
  }
  private async audit(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
    action: string,
  ) {
    const row = this.serialize(await this.owned(tx, userId, id));
    await tx.transactionRevision.create({
      data: {
        userId,
        transactionId: id,
        revision: row.revision,
        action,
        snapshot: row,
      },
    });
    return row;
  }
  async get(userId: string, id: string) {
    return this.serialize(await this.owned(this.db, userId, id));
  }
  async list(userId: string, query: TransactionsQuery) {
    const where: Prisma.ManualTransactionWhereInput = {
      userId,
      deletedAt: query.status === 'deleted' ? { not: null } : null,
      ...(query.accountId ? { accountId: query.accountId } : {}),
    };
    if (
      query.accountId &&
      !(await this.db.financialAccount.findFirst({
        where: { userId, id: query.accountId },
      }))
    )
      throw new NotFoundException('Account not found');
    if (query.after) {
      const cursor = await this.db.manualTransaction.findFirst({
        where: { ...where, id: query.after },
      });
      if (!cursor) throw new NotFoundException('Cursor not found');
      where.OR = [
        { date: { lt: cursor.date } },
        { date: cursor.date, id: { lt: cursor.id } },
      ];
    }
    const rows = await this.db.manualTransaction.findMany({
      where,
      include,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 51,
    });
    return {
      items: rows.slice(0, 50).map((row) => this.serialize(row)),
      nextCursor: rows.length > 50 ? rows[49]!.id : null,
    };
  }
  async history(userId: string, id: string, before?: number) {
    await this.owned(this.db, userId, id);
    const rows = await this.db.transactionRevision.findMany({
      where: {
        userId,
        transactionId: id,
        ...(before ? { revision: { lt: before } } : {}),
      },
      select: {
        revision: true,
        action: true,
        snapshot: true,
        createdAt: true,
      },
      orderBy: { revision: 'desc' },
      take: 51,
    });
    return {
      items: rows.slice(0, 50),
      nextRevision: rows.length > 50 ? rows[49]!.revision : null,
    };
  }
  async create(userId: string, dto: TransactionCreateInput) {
    const hash = createHash('sha256')
      .update(
        JSON.stringify({
          accountId: dto.accountId,
          payeeId: dto.payeeId ?? null,
          kind: dto.kind,
          amount: new Prisma.Decimal(dto.amount).toFixed(4),
          date: dto.date,
          notes: dto.notes?.normalize('NFKC').trim() || null,
          splits: dto.splits.map((s) => ({
            categoryId: s.categoryId ?? null,
            amount: new Prisma.Decimal(s.amount).toFixed(4),
          })),
        }),
      )
      .digest('hex');
    const result = await this.db.$transaction(async (tx) => {
      await this.lock(tx, userId);
      const existing = await tx.manualTransaction.findUnique({
        where: { userId_requestId: { userId, requestId: dto.requestId } },
        include,
      });
      if (existing) {
        if (existing.requestHash !== hash)
          throw new ConflictException(
            'Request key already used for different input',
          );
        return this.serialize(existing);
      }
      const { splits, ...data } = await this.prepare(tx, userId, dto);
      const row = await tx.manualTransaction.create({
        data: {
          ...data,
          userId,
          requestId: dto.requestId,
          requestHash: hash,
        },
      });
      await tx.transactionSplit.createMany({
        data: splits.map((split) => ({ ...split, transactionId: row.id })),
      });
      await assertAccountBalances(tx, userId, [data.accountId]);
      return this.audit(tx, userId, row.id, 'created');
    });
    this.logger.info('Manual transaction recorded', {
      event: 'transaction_created',
    });
    return result;
  }
  async update(userId: string, id: string, dto: TransactionUpdateInput) {
    const result = await this.db.$transaction(async (tx) => {
      await this.lock(tx, userId);
      const previous = await this.owned(tx, userId, id);
      if (
        previous.deletedAt ||
        previous.revision !== dto.revision ||
        previous.revision >= 2147483646
      )
        throw new ConflictException(
          'Transaction changed; reload before editing',
        );
      const { splits, ...data } = await this.prepare(tx, userId, dto, previous);
      await tx.transactionSplit.deleteMany({
        where: { userId, transactionId: id },
      });
      await tx.manualTransaction.update({
        where: { id },
        data: {
          ...data,
          revision: { increment: 1 },
        },
      });
      await tx.transactionSplit.createMany({
        data: splits.map((split) => ({ ...split, transactionId: id })),
      });
      await assertAccountBalances(tx, userId, [previous.accountId]);
      if (data.accountId !== previous.accountId)
        await assertAccountBalances(tx, userId, [data.accountId]);
      return this.audit(tx, userId, id, 'updated');
    });
    this.logger.info('Manual transaction updated', {
      event: 'transaction_updated',
    });
    return result;
  }
  async remove(userId: string, id: string, revision: number) {
    const result = await this.db.$transaction(async (tx) => {
      await this.lock(tx, userId);
      const previous = await this.owned(tx, userId, id);
      if (previous.deletedAt && previous.revision === revision + 1)
        return this.serialize(previous);
      if (previous.deletedAt || previous.revision !== revision)
        throw new ConflictException(
          'Transaction changed; reload before deleting',
        );
      if (previous.account.archivedAt)
        throw new ConflictException(
          'Restore the account before deleting transactions',
        );
      await tx.manualTransaction.update({
        where: { id },
        data: { deletedAt: new Date(), revision: { increment: 1 } },
      });
      await assertAccountBalances(tx, userId, [previous.accountId]);
      return this.audit(tx, userId, id, 'deleted');
    });
    this.logger.info('Manual transaction deleted', {
      event: 'transaction_deleted',
    });
    return result;
  }
}
export default TransactionsService;
