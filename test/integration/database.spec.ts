import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import databaseUrl from '../../src/config/database-url';
import validate from '../../src/config/validation';
import { PrismaClient } from '../../src/generated/prisma/client';

describe('real PostgreSQL integrity', () => {
  const settings = validate(process.env);
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl(settings) }),
  });
  let userId: string;
  beforeAll(async () => {
    if (settings.NODE_ENV !== 'test' || !settings.POSTGRES_DB.endsWith('_test'))
      throw Error('Use an isolated _test database');
    await db.$connect();
    userId = (
      await db.user.create({
        data: {
          email: randomUUID() + '@test.invalid',
          passwordHash: 'not-a-real-password',
        },
      })
    ).id;
  });
  afterAll(async () => {
    if (userId) {
      await db.user.delete({ where: { id: userId } });
    }
    await db.$disconnect();
  });
  test('enforces unique user emails', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    await expect(
      db.user.create({ data: { email: user.email, passwordHash: 'hash' } }),
    ).rejects.toThrow();
  });
  test('enforces session ownership', async () => {
    await expect(
      db.session.create({
        data: {
          userId: randomUUID(),
          tokenHash: 'a'.repeat(64),
          expiresAt: new Date(Date.now() + 60000),
        },
      }),
    ).rejects.toThrow();
  });
  test('rolls back related writes atomically', async () => {
    const email = randomUUID() + '@test.invalid';
    await expect(
      db.$transaction(async (tx) => {
        await tx.user.create({ data: { email, passwordHash: 'hash' } });
        throw Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
  });
  test('runtime role cannot create tables', async () => {
    await expect(
      db.$executeRawUnsafe('CREATE TABLE should_not_exist (id integer)'),
    ).rejects.toThrow();
  });
  test('sample table is outside the active schema and inaccessible', async () => {
    const result = await db.$queryRaw<Array<{ table: string | null }>>`
      SELECT to_regclass('public."Account"')::text AS "table"
    `;
    expect(result[0].table).toBeNull();
    await expect(
      db.$queryRawUnsafe('SELECT * FROM speckvue_archive."Account"'),
    ).rejects.toThrow();
  });
});
