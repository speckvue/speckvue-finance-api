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
import {
  assertAccountBalances,
  maximumBalance,
} from '../ledger/account-balances';
import type {
  TransferCreateInput,
  TransferInput,
  TransfersQuery,
  TransferUpdateInput,
} from './transfers.dto';

const include = {
  sourceAccount: true,
  destinationAccount: true,
  feeAccount: true,
  feeCategory: true,
} as const;
type Row = Prisma.FinancialTransferGetPayload<{ include: typeof include }>;
const Exact = Prisma.Decimal.clone({
  precision: 80,
  rounding: Prisma.Decimal.ROUND_HALF_UP,
});
const accountIds = (row: {
  sourceAccountId: string;
  destinationAccountId: string;
  feeAccountId: string | null;
}) => [
  row.sourceAccountId,
  row.destinationAccountId,
  ...(row.feeAccountId ? [row.feeAccountId] : []),
];

/** Keeps both transfer principals and a separate expense fee in one owner-locked aggregate. */
@Injectable()
class TransfersService {
  constructor(
    private readonly db: PrismaService,
    private readonly categories: CategoriesService,
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
    const row = await tx.financialTransfer.findFirst({
      where: { userId, id },
      include,
    });
    if (!row) throw new NotFoundException('Transfer not found');
    return row;
  }
  private serialize(row: Row) {
    const movements = [
      {
        accountId: row.sourceAccountId,
        accountName: row.sourceAccount.name,
        currency: row.sourceAccount.currency,
        role: 'outgoing',
        classification: 'transfer',
        amount: row.sentAmount.negated().toFixed(4),
      },
      {
        accountId: row.destinationAccountId,
        accountName: row.destinationAccount.name,
        currency: row.destinationAccount.currency,
        role: 'incoming',
        classification: 'transfer',
        amount: row.receivedAmount.toFixed(4),
      },
    ];
    if (row.feeAmount.gt(0))
      movements.push({
        accountId: row.feeAccountId!,
        accountName: row.feeAccount!.name,
        currency: row.feeAccount!.currency,
        role: 'fee',
        classification: 'expense',
        amount: row.feeAmount.negated().toFixed(4),
      });
    return {
      id: row.id,
      sourceAccountId: row.sourceAccountId,
      sourceAccountName: row.sourceAccount.name,
      sourceCurrency: row.sourceAccount.currency,
      destinationAccountId: row.destinationAccountId,
      destinationAccountName: row.destinationAccount.name,
      destinationCurrency: row.destinationAccount.currency,
      sentAmount: row.sentAmount.toFixed(4),
      receivedAmount: row.receivedAmount.toFixed(4),
      exchangeRate: row.exchangeRate.toFixed(30),
      feeAmount: row.feeAmount.toFixed(4),
      feeAccountId: row.feeAccountId,
      feeAccountName: row.feeAccount?.name ?? null,
      feeCurrency: row.feeAccount?.currency ?? null,
      feeCategoryId: row.feeCategoryId,
      feeCategoryName: row.feeCategory?.name ?? null,
      date: row.date.toISOString().slice(0, 10),
      notes: row.notes,
      revision: row.revision,
      accountsArchived: [
        row.sourceAccount,
        row.destinationAccount,
        row.feeAccount,
      ].some((a) => a?.archivedAt != null),
      deletedAt: row.deletedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      movements,
    };
  }
  private async prepare(
    tx: Prisma.TransactionClient,
    userId: string,
    dto: TransferInput,
    previous?: Row,
  ) {
    if (dto.sourceAccountId === dto.destinationAccountId)
      throw new BadRequestException('Choose two different accounts');
    const fee = new Exact(dto.feeAmount ?? '0');
    if (fee.eq(0) && (dto.feeAccountId || dto.feeCategoryId))
      throw new BadRequestException(
        'Remove fee selections when there is no fee',
      );
    if (fee.gt(0) && !dto.feeAccountId)
      throw new BadRequestException('Select the account charged for the fee');
    const ids = [
      dto.sourceAccountId,
      dto.destinationAccountId,
      ...(dto.feeAccountId ? [dto.feeAccountId] : []),
    ];
    const accounts = await tx.financialAccount.findMany({
      where: { userId, id: { in: [...new Set(ids)] } },
    });
    if (accounts.length !== new Set(ids).size)
      throw new NotFoundException('Account not found');
    if (
      accounts.some((a) => a.archivedAt) ||
      (previous && this.serialize(previous).accountsArchived)
    )
      throw new ConflictException(
        'Restore involved accounts before changing a transfer',
      );
    const source = accounts.find((a) => a.id === dto.sourceAccountId)!;
    const destination = accounts.find(
      (a) => a.id === dto.destinationAccountId,
    )!;
    const charged = accounts.find((a) => a.id === dto.feeAccountId);
    const money = (value: string, currency: string, zero = false) => {
      const amount = new Exact(value);
      const digits = new Intl.NumberFormat('en', {
        style: 'currency',
        currency,
      }).resolvedOptions().maximumFractionDigits!;
      if (
        (zero ? amount.lt(0) : !amount.gt(0)) ||
        amount.gt(maximumBalance) ||
        amount.decimalPlaces() > digits
      )
        throw new BadRequestException(
          'Use valid positive amounts within each account currency precision',
        );
      return amount;
    };
    const sentAmount = money(dto.sentAmount, source.currency);
    const receivedAmount = money(dto.receivedAmount, destination.currency);
    if (
      source.currency === destination.currency &&
      !sentAmount.eq(receivedAmount)
    )
      throw new BadRequestException(
        'Same-currency principal amounts must match; record fees separately',
      );
    const feeAmount = charged
      ? money(dto.feeAmount ?? '0', charged.currency, true)
      : fee;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en', {
        timeZone: user.timezone ?? 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .formatToParts(new Date())
        .map((p) => [p.type, p.value]),
    );
    if (
      dto.date > `${parts.year}-${parts.month}-${parts.day}` ||
      accounts.some(
        (a) => dto.date < a.openingBalanceDate.toISOString().slice(0, 10),
      )
    )
      throw new BadRequestException(
        'Choose a date on or after every involved opening date and no later than today',
      );
    const feeCategoryId = dto.feeCategoryId ?? null;
    if (feeCategoryId && feeCategoryId !== previous?.feeCategoryId)
      await this.categories.requireAssignable(
        tx,
        userId,
        feeCategoryId,
        'expense',
      );
    const notes = dto.notes?.normalize('NFKC').trim() || null;
    if (
      notes &&
      (notes.length > 2000 ||
        Array.from(notes).some(
          (c) => /\p{Cc}/u.test(c) && !'\n\r\t'.includes(c),
        ))
    )
      throw new BadRequestException('Invalid transfer notes');
    return {
      sourceAccountId: source.id,
      destinationAccountId: destination.id,
      sentAmount,
      receivedAmount,
      exchangeRate: receivedAmount.div(sentAmount).toDecimalPlaces(30),
      feeAmount,
      feeAccountId: charged?.id ?? null,
      feeCategoryId,
      feeCategoryKind: 'expense',
      date: new Date(dto.date + 'T00:00:00.000Z'),
      notes,
    };
  }
  private hash(dto: TransferInput) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          sourceAccountId: dto.sourceAccountId,
          destinationAccountId: dto.destinationAccountId,
          sentAmount: new Exact(dto.sentAmount).toFixed(4),
          receivedAmount: new Exact(dto.receivedAmount).toFixed(4),
          feeAmount: new Exact(dto.feeAmount ?? '0').toFixed(4),
          feeAccountId: dto.feeAccountId ?? null,
          feeCategoryId: dto.feeCategoryId ?? null,
          date: dto.date,
          notes: dto.notes?.normalize('NFKC').trim() || null,
        }),
      )
      .digest('hex');
  }
  private async audit(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
    action: string,
  ) {
    const row = this.serialize(await this.owned(tx, userId, id));
    await tx.transferRevision.create({
      data: {
        userId,
        transferId: id,
        revision: row.revision,
        action,
        snapshot: row,
      },
    });
    return row;
  }
  async get(userId: string, id: string) {
    return this.db.$transaction(
      async (tx) => this.serialize(await this.owned(tx, userId, id)),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async list(userId: string, query: TransfersQuery) {
    return this.db.$transaction(
      async (tx) => {
        if (
          query.accountId &&
          !(await tx.financialAccount.findFirst({
            where: { userId, id: query.accountId },
          }))
        )
          throw new NotFoundException('Account not found');
        const where: Prisma.FinancialTransferWhereInput = {
          userId,
          deletedAt: query.status === 'deleted' ? { not: null } : null,
          ...(query.accountId
            ? {
                OR: [
                  { sourceAccountId: query.accountId },
                  { destinationAccountId: query.accountId },
                  { feeAccountId: query.accountId },
                ],
              }
            : {}),
        };
        if (query.after) {
          const cursor = await tx.financialTransfer.findFirst({
            where: { ...where, id: query.after },
          });
          if (!cursor) throw new NotFoundException('Cursor not found');
          where.AND = [
            {
              OR: [
                { date: { lt: cursor.date } },
                { date: cursor.date, id: { lt: cursor.id } },
              ],
            },
          ];
        }
        const rows = await tx.financialTransfer.findMany({
          where,
          include,
          orderBy: [{ date: 'desc' }, { id: 'desc' }],
          take: 51,
        });
        return {
          items: rows.slice(0, 50).map((row) => this.serialize(row)),
          nextCursor: rows.length > 50 ? rows[49]!.id : null,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async history(userId: string, id: string, before?: number) {
    await this.owned(this.db, userId, id);
    const rows = await this.db.transferRevision.findMany({
      where: {
        userId,
        transferId: id,
        ...(before ? { revision: { lt: before } } : {}),
      },
      select: { revision: true, action: true, snapshot: true, createdAt: true },
      orderBy: { revision: 'desc' },
      take: 51,
    });
    return {
      items: rows.slice(0, 50),
      nextRevision: rows.length > 50 ? rows[49]!.revision : null,
    };
  }
  async create(userId: string, dto: TransferCreateInput) {
    const hash = this.hash(dto);
    const result = await this.db.$transaction(async (tx) => {
      await this.lock(tx, userId);
      const existing = await tx.financialTransfer.findUnique({
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
      const data = await this.prepare(tx, userId, dto);
      const row = await tx.financialTransfer.create({
        data: { ...data, userId, requestId: dto.requestId, requestHash: hash },
      });
      await assertAccountBalances(tx, userId, accountIds(data));
      return this.audit(tx, userId, row.id, 'created');
    });
    this.logger.info('Transfer recorded', { event: 'transfer_created' });
    return result;
  }
  async update(userId: string, id: string, dto: TransferUpdateInput) {
    const result = await this.db.$transaction(async (tx) => {
      await this.lock(tx, userId);
      const old = await this.owned(tx, userId, id);
      if (
        old.deletedAt ||
        old.revision !== dto.revision ||
        old.revision >= 2147483646
      )
        throw new ConflictException('Transfer changed; reload before editing');
      const data = await this.prepare(tx, userId, dto, old);
      await tx.financialTransfer.update({
        where: { id },
        data: { ...data, revision: { increment: 1 } },
      });
      await assertAccountBalances(tx, userId, [
        ...accountIds(old),
        ...accountIds(data),
      ]);
      return this.audit(tx, userId, id, 'updated');
    });
    this.logger.info('Transfer updated', { event: 'transfer_updated' });
    return result;
  }
  async remove(userId: string, id: string, revision: number) {
    const result = await this.db.$transaction(async (tx) => {
      await this.lock(tx, userId);
      const old = await this.owned(tx, userId, id);
      if (old.deletedAt && old.revision === revision + 1)
        return this.serialize(old);
      if (old.deletedAt || old.revision !== revision)
        throw new ConflictException('Transfer changed; reload before deleting');
      if (this.serialize(old).accountsArchived)
        throw new ConflictException(
          'Restore involved accounts before deleting a transfer',
        );
      await tx.financialTransfer.update({
        where: { id },
        data: { deletedAt: new Date(), revision: { increment: 1 } },
      });
      await assertAccountBalances(tx, userId, accountIds(old));
      return this.audit(tx, userId, id, 'deleted');
    });
    this.logger.info('Transfer deleted', { event: 'transfer_deleted' });
    return result;
  }
}
export default TransfersService;
