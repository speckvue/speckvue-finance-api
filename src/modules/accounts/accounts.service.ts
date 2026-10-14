import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import AppLogger from '../../common/logging/app-logger.service';
import money from '../../common/utils/money';
import PrismaService from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { CreateAccountDto, ListAccountsDto } from './accounts.dto';

const safe = {
  id: true,
  name: true,
  currency: true,
  openingBalance: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
} satisfies Prisma.AccountSelect;

type Selected = Prisma.AccountGetPayload<{ select: typeof safe }>;

@Injectable()
class AccountsService {
  constructor(
    private readonly db: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  private serialize(record: Selected) {
    return { ...record, openingBalance: record.openingBalance.toFixed(4) };
  }

  async create(userId: string, dto: CreateAccountDto, key: string) {
    const amount = money(dto.openingBalance);
    const requestHash = createHash('sha256')
      .update(JSON.stringify([dto.name, dto.currency, amount.toFixed(4)]))
      .digest('hex');
    try {
      const record = await this.db.account.create({
        data: {
          userId,
          name: dto.name,
          currency: dto.currency,
          openingBalance: amount,
          idempotencyKey: key,
          requestHash,
        },
        select: safe,
      });
      this.logger.info('Account audit', { event: 'account_created' });
      return this.serialize(record);
    } catch (error) {
      if (!(
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ))
        throw error;
      const previous = await this.db.account.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
      });
      if (!previous || previous.requestHash !== requestHash)
        throw new ConflictException(
          'Idempotency key already used for another request',
        );
      this.logger.info('Account audit', { event: 'account_creation_replayed' });
      return this.serialize(previous);
    }
  }

  async list(userId: string, query: ListAccountsDto) {
    let after: Prisma.AccountWhereInput = {};
    if (query.cursor) {
      const cursor = await this.db.account.findFirst({
        where: { id: query.cursor, userId, archivedAt: null },
        select: { id: true, createdAt: true },
      });
      if (!cursor) throw new NotFoundException();
      after = {
        OR: [
          { createdAt: { gt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { gt: cursor.id } },
        ],
      };
    }
    const records = await this.db.account.findMany({
      where: { userId, archivedAt: null, ...after },
      select: safe,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
    });
    return {
      data: records.slice(0, query.limit).map((r) => this.serialize(r)),
      nextCursor:
        records.length > query.limit ? records[query.limit - 1].id : null,
    };
  }

  async read(userId: string, id: string) {
    const record = await this.db.account.findFirst({
      where: { id, userId, archivedAt: null },
      select: safe,
    });
    if (!record) throw new NotFoundException();
    return this.serialize(record);
  }

  async rename(userId: string, id: string, name: string) {
    const result = await this.db.account.updateMany({
      where: { id, userId, archivedAt: null },
      data: { name },
    });
    if (result.count !== 1) throw new NotFoundException();
    this.logger.info('Account audit', { event: 'account_renamed' });
    return this.read(userId, id);
  }

  async archive(userId: string, id: string): Promise<void> {
    const result = await this.db.account.updateMany({
      where: { id, userId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (result.count !== 1) throw new NotFoundException();
    this.logger.info('Account audit', { event: 'account_archived' });
  }
}

export default AccountsService;
