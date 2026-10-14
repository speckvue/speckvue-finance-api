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
      await db.account.deleteMany({ where: { userId } });
      await db.user.delete({ where: { id: userId } });
    }
    await db.$disconnect();
  });
  test('stores exact decimals with a valid owner', async () => {
    const account = await db.account.create({
      data: {
        userId,
        name: 'Precision',
        currency: 'USD',
        openingBalance: '9999999999999999.9999',
        idempotencyKey: randomUUID(),
        requestHash: 'a'.repeat(64),
      },
    });
    expect(account.openingBalance.toFixed(4)).toBe('9999999999999999.9999');
  });
  test('enforces owner foreign keys', async () => {
    await expect(
      db.account.create({
        data: {
          userId: randomUUID(),
          name: 'Orphan',
          currency: 'USD',
          openingBalance: '0',
          idempotencyKey: randomUUID(),
          requestHash: 'a'.repeat(64),
        },
      }),
    ).rejects.toThrow();
  });
  test('enforces monetary currency constraints', async () => {
    await expect(
      db.account.create({
        data: {
          userId,
          name: 'Bad',
          currency: 'usd',
          openingBalance: '0',
          idempotencyKey: randomUUID(),
          requestHash: 'a'.repeat(64),
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
});
