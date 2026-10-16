import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import 'reflect-metadata';
import request from 'supertest';
import AppModule from '../../src/app.module';
import configureApp from '../../src/configure-app';
import PrismaService from '../../src/database/prisma.service';
import type TransactionsService from '../../src/modules/transactions/transactions.service';
type Posted = Awaited<ReturnType<TransactionsService['get']>>;
type RevisionRow = { action: string; snapshot: Posted };

describe('manual transaction ledger and immutable history', () => {
  let app: NestExpressApplication;
  let db: PrismaService;
  const identities: Array<{ id: string; cookie: string; csrf: string }> = [];
  const emails = [
    randomUUID() + '@test.invalid',
    randomUUID() + '@test.invalid',
  ];
  const oldPrefix = process.env.REDIS_KEY_PREFIX;
  const origin = 'http://localhost:3000';
  let account: string;
  let otherAccount: string;
  let foreignAccount: string;
  let incomeCategory: string;
  let food: string;
  let leisure: string;
  let payee: string;
  const call = (
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    body?: object,
    owner = 0,
  ) => {
    const req = request(app.getHttpServer())
      [method]('/api/v1' + path)
      .set('Cookie', identities[owner]!.cookie);
    if (method !== 'get')
      req.set('Origin', origin).set('X-CSRF-Token', identities[owner]!.csrf);
    return body ? req.send(body) : req;
  };
  const accountInput = (currency = 'USD', openingBalance = '100.00') => ({
    name: 'Ledger account',
    type: 'bank',
    currency,
    openingBalance,
    openingBalanceDate: '2020-01-01',
  });
  const input = (overrides: object = {}) => ({
    requestId: randomUUID(),
    accountId: account,
    kind: 'expense',
    amount: '10.10',
    date: '2026-01-02',
    notes: 'Receipt note',
    payeeId: payee,
    splits: [{ categoryId: food, amount: '10.10' }],
    ...overrides,
  });
  const create = async (overrides: object = {}) =>
    (await call('post', '/transactions', input(overrides)).expect(201)).body;
  const balance = async (id = account) =>
    (await call('get', '/accounts/' + id).expect(200)).body
      .currentBalance as string;
  const replace = (row: Posted, overrides: object = {}) => {
    const { requestId, ...body } = input();
    void requestId;
    return call('patch', '/transactions/' + row.id, {
      ...body,
      accountId: row.accountId,
      kind: row.kind,
      amount: row.amount,
      date: row.date,
      payeeId: row.payeeId,
      notes: row.notes ?? '',
      splits: row.splits.map((s: Posted['splits'][number]) => ({
        categoryId: s.categoryId,
        amount: s.amount,
      })),
      revision: row.revision,
      ...overrides,
    });
  };
  beforeAll(async () => {
    if (
      process.env.NODE_ENV !== 'test' ||
      !process.env.POSTGRES_DB?.endsWith('_test')
    )
      throw Error('Use an isolated _test database');
    process.env.REDIS_KEY_PREFIX = oldPrefix + ':transactions:' + randomUUID();
    app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: false,
      bodyParser: false,
    });
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    for (const email of emails) {
      const password = 'Manual ledger testing passphrase very unique!';
      await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .set('Origin', origin)
        .send({ email, password })
        .expect(201);
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/signin')
        .set('Origin', origin)
        .send({ email, password })
        .expect(200);
      identities.push({
        id: (await db.user.findUniqueOrThrow({ where: { email } })).id,
        cookie: String(response.headers['set-cookie'][0]).split(';')[0]!,
        csrf: response.body.csrfToken,
      });
    }
    account = (await call('post', '/accounts', accountInput()).expect(201)).body
      .id;
    otherAccount = (await call('post', '/accounts', accountInput()).expect(201))
      .body.id;
    foreignAccount = (
      await call('post', '/accounts', accountInput(), 1).expect(201)
    ).body.id;
    const category = async (name: string, kind: string) =>
      (
        await call('post', '/categories', {
          name,
          kind,
          color: 'lime',
          icon: 'tag',
          parentId: null,
        }).expect(201)
      ).body.items.find((c: { name: string }) => c.name === name).id;
    incomeCategory = await category('Salary', 'income');
    food = await category('Food', 'expense');
    leisure = await category('Leisure', 'expense');
    payee = (
      await call('post', '/payees', {
        name: 'Market',
        kind: 'merchant',
      }).expect(201)
    ).body.id;
  });
  afterAll(async () => {
    if (db) await db.user.deleteMany({ where: { email: { in: emails } } });
    if (app) await app.close();
    process.env.REDIS_KEY_PREFIX = oldPrefix;
  });

  test('requires authentication/CSRF, rejects owner and writable balance fields', async () => {
    await request(app.getHttpServer()).get('/api/v1/transactions').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set('Cookie', identities[0]!.cookie)
      .set('Origin', origin)
      .send(input())
      .expect(403);
    await call(
      'post',
      '/transactions',
      input({ userId: identities[1]!.id }),
    ).expect(400);
    await call('post', '/transactions', input({ currentBalance: '1' })).expect(
      400,
    );
    expect((await call('get', '/transactions').expect(200)).body.items).toEqual(
      [],
    );
  });
  test('income, expense and refund use exact deltas; opening balance is not income', async () => {
    expect(await balance()).toBe('100.0000');
    const income = await create({
      kind: 'income',
      amount: '20.20',
      splits: [{ categoryId: incomeCategory, amount: '20.20' }],
    });
    expect(income.amount).toBe('20.2000');
    expect(await balance()).toBe('120.2000');
    await create();
    expect(await balance()).toBe('110.1000');
    await create({
      kind: 'refund',
      amount: '0.10',
      splits: [{ categoryId: food, amount: '0.10' }],
    });
    expect(await balance()).toBe('110.2000');
  });
  test('balanced splits post once, edits update amount and keep immutable snapshots', async () => {
    const before = await balance();
    const row = await create({
      amount: '3.30',
      splits: [
        { categoryId: food, amount: '1.10' },
        { categoryId: leisure, amount: '2.20' },
      ],
    });
    const updated = (
      await replace(row, {
        amount: '4.40',
        notes: 'Updated note',
        splits: [
          { categoryId: food, amount: '2.20' },
          { categoryId: leisure, amount: '2.20' },
        ],
      }).expect(200)
    ).body;
    expect(updated.revision).toBe(2);
    const history = (
      await call('get', '/transactions/' + row.id + '/history').expect(200)
    ).body.items;
    expect(history.map((h: RevisionRow) => h.action)).toEqual([
      'updated',
      'created',
    ]);
    expect(history[1].snapshot.amount).toBe('3.3000');
    expect(history[1].snapshot.notes).toBe('Receipt note');
    await call('delete', '/transactions/' + row.id, { revision: 2 }).expect(
      200,
    );
    expect(await balance()).toBe(before);
    const deleted = (await call('get', '/transactions/' + row.id).expect(200))
      .body;
    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted.revision).toBe(3);
    await call('delete', '/transactions/' + row.id, { revision: 2 }).expect(
      200,
    );
    expect(await balance()).toBe(before);
    await replace(deleted).expect(409);
  });
  test('concurrent duplicate creates post exactly once and mismatched key reuse fails', async () => {
    const body = input();
    const responses = await Promise.all([
      call('post', '/transactions', body),
      call('post', '/transactions', body),
    ]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(responses[0]!.body.id).toBe(responses[1]!.body.id);
    await call('post', '/transactions', { ...body, notes: 'different' }).expect(
      409,
    );
    expect(
      await db.transactionRevision.count({
        where: { transactionId: responses[0]!.body.id },
      }),
    ).toBe(1);
  });
  test('stale and racing updates cannot overwrite a newer revision', async () => {
    const row = await create();
    const edits = await Promise.all([
      replace(row, { notes: 'first' }),
      replace(row, { notes: 'second' }),
    ]);
    const results = await Promise.all(edits);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    await call('delete', '/transactions/' + row.id, { revision: 1 }).expect(
      409,
    );
  });
  test('rejects zero, negatives, exponent notation, non-string money and precision errors atomically', async () => {
    const before = await balance();
    for (const amount of ['0', '-1', '1e2', 1, '1.001', '1000000000000000'])
      await call(
        'post',
        '/transactions',
        input({ amount, splits: [{ categoryId: food, amount }] }),
      ).expect(400);
    expect(await balance()).toBe(before);
  });
  test('rejects mismatched sums, duplicate lines, wrong category kinds and future/invalid dates', async () => {
    await call(
      'post',
      '/transactions',
      input({ splits: [{ categoryId: food, amount: '1' }] }),
    ).expect(400);
    await call(
      'post',
      '/transactions',
      input({
        amount: '2',
        splits: [
          { categoryId: food, amount: '1' },
          { categoryId: food, amount: '1' },
        ],
      }),
    ).expect(400);
    await call(
      'post',
      '/transactions',
      input({ splits: [{ categoryId: incomeCategory, amount: '10.10' }] }),
    ).expect(409);
    for (const date of ['2019-12-31', '2999-01-01', '2026-02-30'])
      await call('post', '/transactions', input({ date })).expect(400);
    await call('post', '/transactions', input({ splits: [] })).expect(400);
  });
  test('isolates reads, history, cursors and every assignment by owner', async () => {
    const row = await create();
    for (const suffix of ['', '/history'])
      await call(
        'get',
        '/transactions/' + row.id + suffix,
        undefined,
        1,
      ).expect(404);
    await call('get', '/transactions?after=' + row.id, undefined, 1).expect(
      404,
    );
    await call(
      'patch',
      '/transactions/' + row.id,
      { ...input(), requestId: undefined, revision: 1 },
      1,
    ).expect(404);
    await call('delete', '/transactions/' + row.id, { revision: 1 }, 1).expect(
      404,
    );
    await call(
      'post',
      '/transactions',
      input({ accountId: foreignAccount }),
    ).expect(404);
    const foreignCategory = await db.category.create({
      data: {
        userId: identities[1]!.id,
        name: 'Foreign',
        kind: 'expense',
        color: 'lime',
        icon: 'tag',
      },
    });
    await call(
      'post',
      '/transactions',
      input({ splits: [{ categoryId: foreignCategory.id, amount: '10.10' }] }),
    ).expect(404);
    const foreignPayee = await db.payee.create({
      data: { userId: identities[1]!.id, name: 'Foreign', kind: 'person' },
    });
    await call(
      'post',
      '/transactions',
      input({ payeeId: foreignPayee.id }),
    ).expect(404);
  });
  test('same-currency account moves reverse the old account and post the new account', async () => {
    const row = await create({ accountId: otherAccount });
    expect(await balance(otherAccount)).toBe('89.9000');
    await replace(row, { accountId: account }).expect(200);
    expect(await balance(otherAccount)).toBe('100.0000');
    const metadata = (
      await call('get', '/accounts/' + otherAccount).expect(200)
    ).body;
    expect(metadata.hasTransactions).toBe(true);
    await call(
      'patch',
      '/accounts/' + otherAccount,
      accountInput('USD', '101'),
    ).expect(409);
    const eur = (
      await call('post', '/accounts', accountInput('EUR')).expect(201)
    ).body.id;
    await replace(
      { ...row, accountId: account, revision: 2 },
      { accountId: eur },
    ).expect(409);
  });
  test('account opening amount/date lock after history, while names remain editable', async () => {
    await call('patch', '/accounts/' + account, {
      ...accountInput(),
      name: 'Renamed account',
    }).expect(200);
    await call(
      'patch',
      '/accounts/' + account,
      accountInput('USD', '200'),
    ).expect(409);
    await call('patch', '/accounts/' + account, {
      ...accountInput(),
      openingBalanceDate: '2020-01-02',
    }).expect(409);
  });
  test('archived accounts block create/edit/delete until restored', async () => {
    const row = await create();
    await call('post', '/accounts/' + account + '/archive', {}).expect(200);
    await call('post', '/transactions', input()).expect(409);
    await replace(row).expect(409);
    await call('delete', '/transactions/' + row.id, { revision: 1 }).expect(
      409,
    );
    await call('post', '/accounts/' + account + '/restore', {}).expect(200);
    await call('delete', '/transactions/' + row.id, { revision: 1 }).expect(
      200,
    );
  });
  test('retains historical archived categories/payees while rejecting new assignments', async () => {
    const row = await create();
    await call('post', '/categories/' + food + '/archive', {}).expect(200);
    await call('post', '/payees/' + payee + '/archive', {}).expect(200);
    await replace(row, { notes: 'Retain historical choices' }).expect(200);
    await call('post', '/transactions', input()).expect(409);
    await call('post', '/categories/' + food + '/restore', {}).expect(200);
    await call('post', '/payees/' + payee + '/restore', {}).expect(200);
  });
  test('merged payees resolve in history views without rewriting immutable snapshots', async () => {
    const row = await create();
    const target = (
      await call('post', '/payees', {
        name: 'Surviving Market',
        kind: 'merchant',
      }).expect(201)
    ).body.id;
    await call('post', '/payees/' + payee + '/merge', {
      targetId: target,
    }).expect(200);
    expect(
      (await call('get', '/transactions/' + row.id).expect(200)).body.payeeName,
    ).toBe('Surviving Market');
    expect(
      (await call('get', '/transactions/' + row.id + '/history').expect(200))
        .body.items[0].snapshot.payeeName,
    ).toBe('Market');
    expect((await create()).payeeId).toBe(target);
  });
  test('derived balance overflow and deletion overflow roll back their changes', async () => {
    const maxAccount = (
      await call(
        'post',
        '/accounts',
        accountInput('USD', '999999999999999.99'),
      ).expect(201)
    ).body.id;
    await call(
      'post',
      '/transactions',
      input({
        accountId: maxAccount,
        kind: 'income',
        amount: '0.01',
        splits: [{ categoryId: null, amount: '0.01' }],
      }),
    ).expect(409);
    expect(await balance(maxAccount)).toBe('999999999999999.9900');
    const expense = await create({
      accountId: maxAccount,
      amount: '0.01',
      splits: [{ categoryId: null, amount: '0.01' }],
    });
    await create({
      accountId: maxAccount,
      kind: 'income',
      amount: '0.01',
      splits: [{ categoryId: null, amount: '0.01' }],
    });
    await call('delete', '/transactions/' + expense.id, { revision: 1 }).expect(
      409,
    );
    expect(
      (await call('get', '/transactions/' + expense.id).expect(200)).body
        .deletedAt,
    ).toBeNull();
  });
  test('currency precision supports zero and three decimal currencies', async () => {
    for (const [currency, valid, invalid] of [
      ['JPY', '1', '0.1'],
      ['KWD', '0.001', '0.0001'],
    ]) {
      const id = (
        await call('post', '/accounts', accountInput(currency, '0')).expect(201)
      ).body.id;
      await create({
        accountId: id,
        amount: valid,
        splits: [{ categoryId: null, amount: valid }],
      });
      await call(
        'post',
        '/transactions',
        input({
          accountId: id,
          amount: invalid,
          splits: [{ categoryId: null, amount: invalid }],
        }),
      ).expect(400);
    }
  });
  test('database ownership foreign keys and audit permissions are defense in depth', async () => {
    const row = await create();
    await expect(
      db.manualTransaction.update({
        where: { id: row.id },
        data: { accountId: foreignAccount },
      }),
    ).rejects.toThrow();
    await expect(
      db.transactionRevision.updateMany({
        where: { userId: identities[0]!.id },
        data: { action: 'deleted' },
      }),
    ).rejects.toThrow();
  });
  test('lists deleted entries separately and pages all records by calendar date then ID', async () => {
    const data = await call('get', '/transactions').expect(200);
    expect(data.body.items.every((r: Posted) => r.deletedAt === null)).toBe(
      true,
    );
    const deleted = await call('get', '/transactions?status=deleted').expect(
      200,
    );
    expect(deleted.body.items.length).toBeGreaterThan(0);
    expect(deleted.body.items.every((r: Posted) => r.deletedAt !== null)).toBe(
      true,
    );
    for (let i = 0; i < 40; i++)
      await create({
        payeeId: null,
        splits: [{ categoryId: null, amount: '10.10' }],
      });
    const first = (await call('get', '/transactions').expect(200)).body;
    expect(first.items.length).toBe(50);
    expect(first.nextCursor).not.toBeNull();
    const second = (
      await call('get', '/transactions?after=' + first.nextCursor).expect(200)
    ).body;
    expect(second.items.length).toBeGreaterThan(0);
    expect(
      new Set([...first.items, ...second.items].map((r: Posted) => r.id)).size,
    ).toBe(first.items.length + second.items.length);
  });
  test('history pagination preserves every revision without capping future edits', async () => {
    let row = await create();
    for (let i = 0; i < 55; i++)
      row = (await replace(row, { notes: 'Revision ' + i }).expect(200)).body;
    const first = (
      await call('get', '/transactions/' + row.id + '/history').expect(200)
    ).body;
    expect(first.items).toHaveLength(50);
    expect(first.nextRevision).toBe(7);
    const older = (
      await call(
        'get',
        '/transactions/' + row.id + '/history?before=' + first.nextRevision,
      ).expect(200)
    ).body;
    expect(older.items).toHaveLength(6);
    expect(older.items[5].action).toBe('created');
    expect(older.nextRevision).toBeNull();
    await call('get', '/transactions/' + row.id + '/history?before=-1').expect(
      400,
    );
    await call(
      'get',
      '/transactions/' + row.id + '/history?before=9999999999999999',
    ).expect(400);
  });
});
