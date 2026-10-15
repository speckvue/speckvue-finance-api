import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import AppLogger from '../../common/logging/app-logger.service';
import PrismaService from '../../database/prisma.service';
import type { FinancialAccount } from '../../generated/prisma/client';
import type { AccountInput, AccountsQuery } from './accounts.dto';

/** Stores owner-scoped financial accounts without converting money to floating point. */
@Injectable()
class AccountsService {
  constructor(
    private readonly db: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  private serialize(account: FinancialAccount) {
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      archivedAt: account.archivedAt,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      openingBalance: account.openingBalance.toFixed(4),
      openingBalanceDate: account.openingBalanceDate.toISOString().slice(0, 10),
    };
  }

  private input(dto: AccountInput) {
    const name = dto.name.trim();
    if (!name || /\p{Cc}/u.test(name))
      throw new BadRequestException('Invalid account name');
    if (!Intl.supportedValuesOf('currency').includes(dto.currency))
      throw new BadRequestException('Unsupported currency');
    const digits = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: dto.currency,
    }).resolvedOptions().maximumFractionDigits!;
    if (
      (dto.openingBalance.split('.')[1] ?? '').replace(/0+$/, '').length >
      digits
    )
      throw new BadRequestException('Amount exceeds currency precision');
    if (dto.openingBalanceDate > new Date().toISOString().slice(0, 10))
      throw new BadRequestException(
        'Opening balance date cannot be in the future',
      );
    return {
      ...dto,
      name,
      openingBalanceDate: new Date(dto.openingBalanceDate + 'T00:00:00.000Z'),
    };
  }

  async list(userId: string, query: AccountsQuery) {
    const rows = await this.db.financialAccount.findMany({
      where: {
        userId,
        archivedAt: query.status === 'archived' ? { not: null } : null,
        ...(query.after ? { id: { gt: query.after } } : {}),
      },
      orderBy: { id: 'asc' },
      take: 51,
    });
    return {
      items: rows.slice(0, 50).map((row) => this.serialize(row)),
      nextCursor: rows.length > 50 ? rows[49]!.id : null,
    };
  }

  async get(userId: string, id: string) {
    const account = await this.db.financialAccount.findFirst({
      where: { userId, id },
    });
    if (!account) throw new NotFoundException('Account not found');
    return this.serialize(account);
  }

  async create(userId: string, dto: AccountInput) {
    const account = await this.db.financialAccount.create({
      data: { ...this.input(dto), userId },
    });
    this.logger.info('Account created', {
      event: 'account_created',
      accountId: account.id,
    });
    return this.serialize(account);
  }

  async update(userId: string, id: string, dto: AccountInput) {
    const result = await this.db.financialAccount.updateMany({
      where: { userId, id, archivedAt: null },
      data: this.input(dto),
    });
    if (!result.count) throw new NotFoundException('Active account not found');
    this.logger.info('Account updated', {
      event: 'account_updated',
      accountId: id,
    });
    return this.get(userId, id);
  }

  async archive(userId: string, id: string, archived: boolean) {
    await this.get(userId, id);
    await this.db.financialAccount.updateMany({
      where: { userId, id, archivedAt: archived ? null : { not: null } },
      data: { archivedAt: archived ? new Date() : null },
    });
    this.logger.info('Account status changed', {
      event: archived ? 'account_archived' : 'account_restored',
      accountId: id,
    });
    return this.get(userId, id);
  }
}
export default AccountsService;
