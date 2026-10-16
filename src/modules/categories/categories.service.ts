import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import AppLogger from '../../common/logging/app-logger.service';
import PrismaService from '../../database/prisma.service';
import { Prisma, type Category } from '../../generated/prisma/client';
import type { CategoryInput } from './categories.dto';

/** Preserves category identities and serializes hierarchy/order changes for each owner. */
@Injectable()
class CategoriesService {
  constructor(
    private readonly db: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  private serialize(row: Category) {
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      description: row.description,
      color: row.color,
      icon: row.icon,
      parentId: row.parentId,
      position: row.position,
      archivedAt: row.archivedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async snapshot(tx: Prisma.TransactionClient, userId: string) {
    const rows = await tx.category.findMany({
      where: { userId },
      orderBy: [{ kind: 'asc' }, { position: 'asc' }, { id: 'asc' }],
    });
    return { items: rows.map((row) => this.serialize(row)) };
  }

  list(userId: string) {
    return this.snapshot(this.db, userId);
  }

  private async owned(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
  ) {
    const row = await tx.category.findFirst({ where: { userId, id } });
    if (!row) throw new NotFoundException('Category not found');
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
    operation: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    try {
      const result = await this.db.$transaction(async (tx) => {
        await this.lock(tx, userId);
        await operation(tx);
        return this.snapshot(tx, userId);
      });
      this.logger.info('Category changed', { event });
      return result;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'A category with this name already exists here, including archived categories.',
        );
      throw error;
    }
  }

  private input(dto: CategoryInput) {
    const name = dto.name.normalize('NFKC').trim();
    const description = dto.description?.trim() || null;
    if (
      !name ||
      name.length > 60 ||
      /\p{Cc}/u.test(name) ||
      (description && /\p{Cc}/u.test(description))
    )
      throw new BadRequestException('Use plain text for category details');
    return {
      name,
      kind: dto.kind,
      description,
      color: dto.color,
      icon: dto.icon,
      parentId: dto.parentId ?? null,
    };
  }

  private async parent(
    tx: Prisma.TransactionClient,
    userId: string,
    parentId: string | null,
    kind: string,
  ) {
    if (!parentId) return;
    const parent = await this.owned(tx, userId, parentId);
    if (parent.archivedAt || parent.parentId || parent.kind !== kind)
      throw new ConflictException(
        'Choose an active top-level category of the same type',
      );
  }

  private async nextPosition(
    tx: Prisma.TransactionClient,
    userId: string,
    kind: string,
    parentId: string | null,
  ) {
    const result = await tx.category.aggregate({
      where: { userId, kind, parentId },
      _max: { position: true },
    });
    return (result._max.position ?? -1) + 1;
  }

  create(userId: string, dto: CategoryInput) {
    const input = this.input(dto);
    return this.write(userId, 'category_created', async (tx) => {
      if ((await tx.category.count({ where: { userId } })) >= 500)
        throw new ConflictException(
          'The limit of 500 categories, including archived categories, has been reached',
        );
      await this.parent(tx, userId, input.parentId, input.kind);
      await tx.category.create({
        data: {
          ...input,
          userId,
          position: await this.nextPosition(
            tx,
            userId,
            input.kind,
            input.parentId,
          ),
        },
      });
    });
  }

  update(userId: string, id: string, dto: CategoryInput) {
    const input = this.input(dto);
    return this.write(userId, 'category_updated', async (tx) => {
      const existing = await this.owned(tx, userId, id);
      if (existing.archivedAt)
        throw new ConflictException('Restore this category before editing');
      if (input.kind !== existing.kind)
        throw new ConflictException('Category type cannot be changed');
      if (input.parentId === id)
        throw new ConflictException('A category cannot be its own parent');
      if (
        input.parentId !== existing.parentId &&
        (await tx.category.count({ where: { userId, parentId: id } }))
      )
        throw new ConflictException(
          'Move subcategories before nesting their parent',
        );
      await this.parent(tx, userId, input.parentId, input.kind);
      const position =
        input.parentId === existing.parentId
          ? existing.position
          : await this.nextPosition(tx, userId, input.kind, input.parentId);
      await tx.category.updateMany({
        where: { userId, id },
        data: { ...input, position },
      });
    });
  }

  archive(userId: string, id: string, archived: boolean) {
    return this.write(
      userId,
      archived ? 'category_archived' : 'category_restored',
      async (tx) => {
        const row = await this.owned(tx, userId, id);
        if (archived) {
          await tx.category.updateMany({
            where: { userId, archivedAt: null, OR: [{ id }, { parentId: id }] },
            data: { archivedAt: new Date() },
          });
        } else {
          await this.parent(tx, userId, row.parentId, row.kind);
          await tx.category.updateMany({
            where: { userId, id, archivedAt: { not: null } },
            data: { archivedAt: null },
          });
        }
      },
    );
  }

  move(userId: string, id: string, direction: 'up' | 'down') {
    return this.write(userId, 'category_reordered', async (tx) => {
      const row = await this.owned(tx, userId, id);
      if (row.archivedAt)
        throw new ConflictException('Restore this category before reordering');
      const siblings = await tx.category.findMany({
        where: {
          userId,
          kind: row.kind,
          parentId: row.parentId,
          archivedAt: null,
        },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
      });
      const index = siblings.findIndex((item) => item.id === id);
      const neighbor = siblings[index + (direction === 'up' ? -1 : 1)];
      if (!neighbor) return;
      await tx.category.updateMany({
        where: { userId, id },
        data: { position: neighbor.position },
      });
      await tx.category.updateMany({
        where: { userId, id: neighbor.id },
        data: { position: row.position },
      });
    });
  }

  /** Call inside the ledger write transaction; archives use the same owner lock. */
  async requireAssignable(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
    kind: 'income' | 'expense',
  ) {
    await this.lock(tx, userId);
    const row = await this.owned(tx, userId, id);
    if (row.archivedAt || row.kind !== kind)
      throw new ConflictException(
        'Choose an active category matching the transaction type',
      );
    await this.parent(tx, userId, row.parentId, kind);
    return row;
  }
}
export default CategoriesService;
