import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import AppLogger from '../../common/logging/app-logger.service';
import PrismaService from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { PayeeInput, PayeesQuery } from './payees.dto';

const include = {
  mergedInto: { select: { name: true } },
  _count: { select: { mergedFrom: true } },
} as const;
type PayeeRow = Prisma.PayeeGetPayload<{ include: typeof include }>;

/** Keeps historical payee identities while serializing merges and new assignments per owner. */
@Injectable()
class PayeesService {
  constructor(
    private readonly db: PrismaService,
    private readonly logger: AppLogger,
  ) {}
  private serialize(row: PayeeRow) {
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      notes: row.notes,
      archivedAt: row.archivedAt,
      mergedIntoId: row.mergedIntoId,
      mergedIntoName: row.mergedInto?.name ?? null,
      mergedAt: row.mergedAt,
      mergedNameCount: row._count.mergedFrom,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
  private async owned(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
  ) {
    const row = await tx.payee.findFirst({ where: { userId, id }, include });
    if (!row) throw new NotFoundException('Payee not found');
    return row;
  }
  async get(userId: string, id: string) {
    return this.serialize(await this.owned(this.db, userId, id));
  }
  private async lock(tx: Prisma.TransactionClient, userId: string) {
    const owners = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
    if (!owners.length) throw new NotFoundException();
  }
  private async write(
    userId: string,
    event: string,
    operation: (tx: Prisma.TransactionClient) => Promise<string>,
  ) {
    const result = await this.db.$transaction(async (tx) => {
      await this.lock(tx, userId);
      return this.serialize(await this.owned(tx, userId, await operation(tx)));
    });
    this.logger.info('Payee changed', { event });
    return result;
  }
  private text(value: string, max: number, multiline = false) {
    const text = value.normalize('NFKC').trim();
    if (
      text.length > max ||
      Array.from(text).some(
        (character) =>
          /\p{Cc}/u.test(character) &&
          !(multiline && '\n\r\t'.includes(character)),
      )
    )
      throw new BadRequestException(
        'Use plain text within the supported length',
      );
    return text;
  }
  private input(dto: PayeeInput) {
    const name = this.text(dto.name, 100).replace(/\s+/gu, ' ');
    if (!name) throw new BadRequestException('Enter a payee name');
    return {
      name,
      kind: dto.kind,
      notes: dto.notes ? this.text(dto.notes, 500, true) || null : null,
    };
  }
  async list(userId: string, query: PayeesQuery) {
    const q = this.text(query.q ?? '', 100)
      .replace(/\s+/gu, ' ')
      .replace(/[\\%_]/g, '\\$&');
    const where: Prisma.PayeeWhereInput = {
      userId,
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.status === 'merged'
        ? { mergedIntoId: { not: null } }
        : {
            mergedIntoId: null,
            archivedAt: query.status === 'archived' ? { not: null } : null,
          }),
      ...(query.excludeId ? { id: { not: query.excludeId } } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { notes: { contains: q, mode: 'insensitive' } },
              {
                mergedFrom: {
                  some: { userId, name: { contains: q, mode: 'insensitive' } },
                },
              },
            ],
          }
        : {}),
    };
    let page: Prisma.PayeeWhereInput = where;
    if (query.after) {
      const cursor = await this.db.payee.findFirst({
        where: { AND: [where, { id: query.after }] },
        select: { id: true, createdAt: true },
      });
      if (!cursor)
        throw new NotFoundException('Reload payees before continuing');
      page = {
        AND: [
          where,
          {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          },
        ],
      };
    }
    const rows = await this.db.payee.findMany({
      where: page,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 51,
      include,
    });
    return {
      items: rows.slice(0, 50).map((row) => this.serialize(row)),
      nextCursor: rows.length > 50 ? rows[49]!.id : null,
    };
  }
  create(userId: string, dto: PayeeInput) {
    const input = this.input(dto);
    return this.write(
      userId,
      'payee_created',
      async (tx) => (await tx.payee.create({ data: { ...input, userId } })).id,
    );
  }
  update(userId: string, id: string, dto: PayeeInput) {
    const input = this.input(dto);
    return this.write(userId, 'payee_updated', async (tx) => {
      const row = await this.owned(tx, userId, id);
      if (row.archivedAt || row.mergedIntoId)
        throw new ConflictException('Only active payees can be edited');
      await tx.payee.updateMany({ where: { userId, id }, data: input });
      return id;
    });
  }
  archive(userId: string, id: string, archived: boolean) {
    return this.write(
      userId,
      archived ? 'payee_archived' : 'payee_restored',
      async (tx) => {
        const row = await this.owned(tx, userId, id);
        if (row.mergedIntoId)
          throw new ConflictException(
            'Merged payees cannot be restored or edited',
          );
        await tx.payee.updateMany({
          where: { userId, id, archivedAt: archived ? null : { not: null } },
          data: { archivedAt: archived ? new Date() : null },
        });
        return id;
      },
    );
  }
  merge(userId: string, sourceId: string, targetId: string) {
    return this.write(userId, 'payees_merged', async (tx) => {
      const source = await this.owned(tx, userId, sourceId);
      const target = await this.owned(tx, userId, targetId);
      if (sourceId === targetId)
        throw new ConflictException('Choose a different surviving payee');
      if (target.archivedAt || target.mergedIntoId)
        throw new ConflictException('Choose an active surviving payee');
      if (source.mergedIntoId === targetId) return targetId;
      if (source.mergedIntoId)
        throw new ConflictException(
          'This payee has already been merged elsewhere',
        );
      await tx.payee.updateMany({
        where: { userId, mergedIntoId: sourceId },
        data: { mergedIntoId: targetId },
      });
      await tx.payee.updateMany({
        where: { userId, id: sourceId },
        data: {
          mergedIntoId: targetId,
          mergedAt: new Date(),
          archivedAt: source.archivedAt ?? new Date(),
        },
      });
      return targetId;
    });
  }
  /** Historical reads allow archived identities; each merge keeps references one hop from the survivor. */
  async resolveForHistory(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
  ) {
    await this.lock(tx, userId);
    const source = await this.owned(tx, userId, id);
    return source.mergedIntoId
      ? this.owned(tx, userId, source.mergedIntoId)
      : source;
  }
  /** Use in the same future ledger write transaction; merge/archive operations take this owner lock too. */
  async requireAssignable(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
  ) {
    const row = await this.resolveForHistory(tx, userId, id);
    if (row.archivedAt || row.mergedIntoId)
      throw new ConflictException('Choose an active payee');
    return row;
  }
}
export default PayeesService;
