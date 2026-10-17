import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import AppLogger from '../../common/logging/app-logger.service';
import PrismaService from '../../database/prisma.service';
import { Prisma, type FinancialAccount } from '../../generated/prisma/client';
import readAccountBalances from '../ledger/account-balances';
import type { AccountInput, AccountsQuery } from './accounts.dto';

const currencies = Intl.supportedValuesOf('currency');
const currencyDigits = Object.fromEntries(
  currencies.map((currency) => [
    currency,
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits!,
  ]),
);

/** Stores owner-scoped financial accounts without converting money to floating point. */
@Injectable()
class AccountsService {
  constructor(
    private readonly db: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  private serialize(
    account: FinancialAccount,
    ledger: { balance: Prisma.Decimal; hasHistory: boolean },
  ) {
    return {
      currentBalance: ledger.balance.toFixed(4),
      hasTransactions: ledger.hasHistory,
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      institution: account.institution,
      notes: account.notes,
      archivedAt: account.archivedAt,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      openingBalance: account.openingBalance.toFixed(4),
      openingBalanceDate: account.openingBalanceDate.toISOString().slice(0, 10),
    };
  }

  async options(userId: string) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    if (!user) throw new NotFoundException();
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: user.timezone ?? 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const date = Object.fromEntries(
      parts.map(({ type, value }) => [type, value]),
    );
    return {
      currencies,
      currencyDigits,
      today: `${date.year}-${date.month}-${date.day}`,
    };
  }

  private async input(userId: string, dto: AccountInput) {
    const name = dto.name.trim();
    if (!name || /\p{Cc}/u.test(name))
      throw new BadRequestException('Invalid account name');
    if (!currencies.includes(dto.currency))
      throw new BadRequestException('Unsupported currency');
    const digits = currencyDigits[dto.currency]!;
    if (
      (dto.openingBalance.split('.')[1] ?? '').replace(/0+$/, '').length >
      digits
    )
      throw new BadRequestException('Amount exceeds currency precision');
    const { today } = await this.options(userId);
    if (dto.openingBalanceDate > today)
      throw new BadRequestException(
        'Opening balance date cannot be in the future',
      );
    return {
      ...dto,
      name,
      institution: this.optionalText(dto.institution, false),
      notes: this.optionalText(dto.notes, true),
      openingBalanceDate: new Date(dto.openingBalanceDate + 'T00:00:00.000Z'),
    };
  }

  private optionalText(value: string | undefined, multiline: boolean) {
    const text = value?.trim() || null;
    if (
      text &&
      Array.from(text).some(
        (character) =>
          /\p{Cc}/u.test(character) &&
          !(multiline && '\n\r\t'.includes(character)),
      )
    )
      throw new BadRequestException('Invalid account details');
    return text;
  }

  async list(userId: string, query: AccountsQuery) {
    return this.db.$transaction(
      async (tx) => {
        const rows = await tx.financialAccount.findMany({
          where: {
            userId,
            archivedAt: query.status === 'archived' ? { not: null } : null,
            ...(query.after ? { id: { gt: query.after } } : {}),
          },
          orderBy: { id: 'asc' },
          take: 51,
        });
        const visible = rows.slice(0, 50);
        const balances = await readAccountBalances(
          tx,
          userId,
          visible.map((row) => row.id),
        );
        return {
          items: visible.map((row) =>
            this.serialize(row, balances.get(row.id)!),
          ),
          nextCursor: rows.length > 50 ? rows[49]!.id : null,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async get(userId: string, id: string) {
    return this.db.$transaction(
      async (tx) => {
        const account = await tx.financialAccount.findFirst({
          where: { userId, id },
        });
        if (!account) throw new NotFoundException('Account not found');
        const balances = await readAccountBalances(tx, userId, [id]);
        return this.serialize(account, balances.get(id)!);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async create(userId: string, dto: AccountInput) {
    const account = await this.db.financialAccount.create({
      data: { ...(await this.input(userId, dto)), userId },
    });
    this.logger.info('Account created', {
      event: 'account_created',
      accountId: account.id,
    });
    return this.get(userId, account.id);
  }

  async update(userId: string, id: string, dto: AccountInput) {
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
      const row = await tx.financialAccount.findFirst({
        where: { userId, id },
      });
      if (!row || row.archivedAt)
        throw new NotFoundException('Active account not found');
      const history = (await readAccountBalances(tx, userId, [id])).get(
        id,
      )!.hasHistory;
      if (
        history &&
        (!row.openingBalance.eq(dto.openingBalance) ||
          row.openingBalanceDate.toISOString().slice(0, 10) !==
            dto.openingBalanceDate)
      )
        throw new ConflictException(
          'Opening balance and date are locked after transaction history exists',
        );
      if (row.currency !== dto.currency)
        throw new ConflictException('Account currency cannot be changed');
      await tx.financialAccount.update({
        where: { id },
        data: await this.input(userId, dto),
      });
    });
    this.logger.info('Account updated', {
      event: 'account_updated',
      accountId: id,
    });
    return this.get(userId, id);
  }

  async archive(userId: string, id: string, archived: boolean) {
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
      if (!(await tx.financialAccount.findFirst({ where: { userId, id } })))
        throw new NotFoundException('Account not found');
      await tx.financialAccount.updateMany({
        where: { userId, id, archivedAt: archived ? null : { not: null } },
        data: { archivedAt: archived ? new Date() : null },
      });
    });
    this.logger.info('Account status changed', {
      event: archived ? 'account_archived' : 'account_restored',
      accountId: id,
    });
    return this.get(userId, id);
  }
}
export default AccountsService;
