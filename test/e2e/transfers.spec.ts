import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import 'reflect-metadata';
import request from 'supertest';
import AppModule from '../../src/app.module';
import configureApp from '../../src/configure-app';
import PrismaService from '../../src/database/prisma.service';
import { Prisma } from '../../src/generated/prisma/client';
import type TransfersService from '../../src/modules/transfers/transfers.service';

type Transfer = Awaited<ReturnType<TransfersService['get']>>;
describe('linked transfers, fees and exact multi-currency balances', () => {
  let app: NestExpressApplication;
  let db: PrismaService;
  const identities: Array<{ id: string; cookie: string; csrf: string }> = [];
  const emails = [
    randomUUID() + '@test.invalid',
    randomUUID() + '@test.invalid',
  ];
  const origin = 'http://localhost:3000';
  let source: string,
    destination: string,
    euro: string,
    yen: string,
    feeCategory: string,
    incomeCategory: string,
    foreignAccount: string;
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
  const account = async (
    currency = 'USD',
    openingBalance = '0',
    owner = 0,
    openingBalanceDate = '2020-01-01',
  ) =>
    (
      await call(
        'post',
        '/accounts',
        {
          name: 'Transfer account ' + randomUUID(),
          type: 'bank',
          currency,
          openingBalance,
          openingBalanceDate,
        },
        owner,
      ).expect(201)
    ).body.id as string;
  const input = (overrides: object = {}) => ({
    requestId: randomUUID(),
    sourceAccountId: source,
    destinationAccountId: destination,
    sentAmount: '10.10',
    receivedAmount: '10.10',
    feeAmount: '0',
    feeAccountId: null,
    feeCategoryId: null,
    date: '2026-01-02',
    notes: 'Transfer note',
    ...overrides,
  });
  const create = async (overrides: object = {}) =>
    (await call('post', '/transfers', input(overrides)).expect(201))
      .body as Transfer;
  const balance = async (id: string) =>
    (await call('get', '/accounts/' + id).expect(200)).body
      .currentBalance as string;
  const change = (row: Transfer, overrides: object = {}) =>
    call('patch', '/transfers/' + row.id, {
      sourceAccountId: row.sourceAccountId,
      destinationAccountId: row.destinationAccountId,
      sentAmount: row.sentAmount,
      receivedAmount: row.receivedAmount,
      feeAmount: row.feeAmount,
      feeAccountId: row.feeAccountId,
      feeCategoryId: row.feeCategoryId,
      date: row.date,
      notes: row.notes ?? '',
      revision: row.revision,
      ...overrides,
    });
  const remove = (row: Transfer) =>
    call('delete', '/transfers/' + row.id, { revision: row.revision });
  beforeAll(async () => {
    if (
      process.env.NODE_ENV !== 'test' ||
      !process.env.POSTGRES_DB?.endsWith('_test')
    )
      throw Error('Use an isolated _test database');
    app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: false,
      bodyParser: false,
    });
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    for (const email of emails) {
      const password = 'Linked transfer testing passphrase very unique!';
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
    source = await account('USD', '1000');
    destination = await account('USD', '100');
    euro = await account('EUR', '20');
    yen = await account('JPY', '500');
    foreignAccount = await account('USD', '100', 1);
    const category = async (name: string, kind: string) =>
      (
        await call('post', '/categories', {
          name,
          kind,
          color: 'lime',
          icon: 'tag',
          parentId: null,
        }).expect(201)
      ).body.items.find((c: { name: string }) => c.name === name).id as string;
    feeCategory = await category('Bank fees', 'expense');
    incomeCategory = await category('Salary', 'income');
  });
  afterAll(async () => {
    if (db) await db.user.deleteMany({ where: { email: { in: emails } } });
    if (app) await app.close();
  });

  test('requires session/CSRF and forbids owner, rate and individual-side writes', async () => {
    await request(app.getHttpServer()).get('/api/v1/transfers').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/transfers')
      .set('Cookie', identities[0]!.cookie)
      .set('Origin', origin)
      .send(input())
      .expect(403);
    for (const extra of [
      { userId: identities[1]!.id },
      { exchangeRate: '1' },
      { movements: [] },
    ])
      await call('post', '/transfers', input(extra)).expect(400);
    expect((await call('get', '/transfers').expect(200)).body.items).toEqual(
      [],
    );
  });
  test('links both same-currency principals without creating income/expense records', async () => {
    const from = await balance(source),
      to = await balance(destination),
      before = await db.manualTransaction.count({
        where: { userId: identities[0]!.id },
      });
    const row = await create();
    expect(
      row.movements.map((m) => [m.role, m.classification, m.amount]),
    ).toEqual([
      ['outgoing', 'transfer', '-10.1000'],
      ['incoming', 'transfer', '10.1000'],
    ]);
    expect(row.exchangeRate).toBe('1.' + '0'.repeat(30));
    expect(await balance(source)).toBe(
      new Prisma.Decimal(from).minus('10.10').toFixed(4),
    );
    expect(await balance(destination)).toBe(
      new Prisma.Decimal(to).plus('10.10').toFixed(4),
    );
    expect(
      await db.manualTransaction.count({
        where: { userId: identities[0]!.id },
      }),
    ).toBe(before);
    expect('userId' in row).toBe(false);
    expect('requestHash' in row).toBe(false);
    await remove(row).expect(200);
    expect(await balance(source)).toBe(from);
    expect(await balance(destination)).toBe(to);
  });
  test('source fees are additional expenses and reverse together with both principals', async () => {
    const from = await balance(source),
      to = await balance(destination);
    const row = await create({
      sentAmount: '100',
      receivedAmount: '100',
      feeAmount: '2.50',
      feeAccountId: source,
      feeCategoryId: feeCategory,
    });
    expect(await balance(source)).toBe(
      new Prisma.Decimal(from).minus('102.50').toFixed(4),
    );
    expect(await balance(destination)).toBe(
      new Prisma.Decimal(to).plus(100).toFixed(4),
    );
    expect(row.movements[2]).toMatchObject({
      role: 'fee',
      classification: 'expense',
      amount: '-2.5000',
      currency: 'USD',
    });
    await remove(row).expect(200);
    expect(await balance(source)).toBe(from);
    expect(await balance(destination)).toBe(to);
  });
  test('destination fees reduce its gross receipt without changing the principal rate', async () => {
    const before = await balance(destination);
    const row = await create({ feeAmount: '1.10', feeAccountId: destination });
    expect(await balance(destination)).toBe(
      new Prisma.Decimal(before).plus(9).toFixed(4),
    );
    expect(row.exchangeRate).toBe('1.' + '0'.repeat(30));
    await remove(row).expect(200);
    expect(await balance(destination)).toBe(before);
  });
  test('third-account fees keep their own currency and precision', async () => {
    const before = await balance(yen);
    const row = await create({
      destinationAccountId: euro,
      receivedAmount: '9.25',
      feeAmount: '1',
      feeAccountId: yen,
      feeCategoryId: feeCategory,
    });
    expect(row.feeCurrency).toBe('JPY');
    expect(await balance(yen)).toBe(
      new Prisma.Decimal(before).minus(1).toFixed(4),
    );
    await remove(row).expect(200);
    await call(
      'post',
      '/transfers',
      input({ feeAmount: '0.1', feeAccountId: yen }),
    ).expect(400);
  });
  test('records actual FX amounts and derives a nonzero rate at extreme magnitudes', async () => {
    const row = await create({
      destinationAccountId: euro,
      sentAmount: '10',
      receivedAmount: '9',
    });
    expect(row.exchangeRate).toBe('0.9' + '0'.repeat(29));
    expect(row.movements[1]).toMatchObject({
      amount: '9.0000',
      currency: 'EUR',
    });
    await remove(row).expect(200);
    const large = await account('USD', '999999999999999.99'),
      small = await account('KWD', '0');
    const tiny = await create({
      sourceAccountId: large,
      destinationAccountId: small,
      sentAmount: '999999999999999.99',
      receivedAmount: '0.001',
    });
    expect(new Prisma.Decimal(tiny.exchangeRate).gt(0)).toBe(true);
    expect(tiny.exchangeRate).toBe('0.000000000000000001000000000000');
    expect(await balance(large)).toBe('0.0000');
    await remove(tiny).expect(200);
  });
  test('rejects same account, mismatched same-currency principals, invalid precision and zero amounts', async () => {
    for (const overrides of [
      { destinationAccountId: source },
      { receivedAmount: '9.10' },
      { sentAmount: '0', receivedAmount: '0' },
      { sentAmount: '-1' },
      { sentAmount: 1 },
      { sentAmount: '1e2' },
      { sentAmount: '0.001', receivedAmount: '0.001' },
    ])
      await call('post', '/transfers', input(overrides)).expect(400);
    for (const overrides of [
      { feeAmount: '0', feeAccountId: source },
      { feeAmount: '1', feeAccountId: null },
      { feeAmount: '0', feeCategoryId: feeCategory },
      { feeAmount: '-1' },
    ])
      await call('post', '/transfers', input(overrides)).expect(400);
  });
  test('validates all involved opening dates, local today, real dates and plain-text notes', async () => {
    for (const date of ['2019-12-31', '2999-01-01', '2026-02-30'])
      await call('post', '/transfers', input({ date })).expect(400);
    const late = await account('JPY', '100', 0, '2026-02-01');
    await call(
      'post',
      '/transfers',
      input({ feeAmount: '1', feeAccountId: late }),
    ).expect(400);
    await call(
      'post',
      '/transfers',
      input({ notes: 'Invalid\u0000note' }),
    ).expect(400);
  });
  test('scope checks cover sources, destinations, fee accounts, categories, records and cursors', async () => {
    for (const overrides of [
      { sourceAccountId: foreignAccount },
      { destinationAccountId: foreignAccount },
      { feeAmount: '1', feeAccountId: foreignAccount },
    ])
      await call('post', '/transfers', input(overrides)).expect(404);
    const foreignCategory = await db.category.create({
      data: {
        userId: identities[1]!.id,
        name: 'Foreign fee',
        kind: 'expense',
        color: 'lime',
        icon: 'tag',
      },
    });
    await call(
      'post',
      '/transfers',
      input({
        feeAmount: '1',
        feeAccountId: source,
        feeCategoryId: foreignCategory.id,
      }),
    ).expect(404);
    await call(
      'post',
      '/transfers',
      input({
        feeAmount: '1',
        feeAccountId: source,
        feeCategoryId: incomeCategory,
      }),
    ).expect(409);
    const row = await create();
    for (const suffix of ['', '/history'])
      await call('get', '/transfers/' + row.id + suffix, undefined, 1).expect(
        404,
      );
    await call('get', '/transfers?accountId=' + source, undefined, 1).expect(
      404,
    );
    await call('get', '/transfers?after=' + row.id, undefined, 1).expect(404);
    await call('delete', '/transfers/' + row.id, { revision: 1 }, 1).expect(
      404,
    );
    const { requestId, ...body } = input();
    void requestId;
    await call(
      'patch',
      '/transfers/' + row.id,
      { ...body, revision: 1 },
      1,
    ).expect(404);
    await remove(row).expect(200);
  });
  test('safe edit changes both principals, fees and account links in a single revision', async () => {
    const a = await account('USD', '100'),
      b = await account('USD', '0'),
      c = await account('EUR', '0'),
      f = await account('JPY', '10');
    const row = await create({
      sourceAccountId: a,
      destinationAccountId: b,
      feeAmount: '1',
      feeAccountId: f,
    });
    const edited = (
      await change(row, {
        destinationAccountId: c,
        sentAmount: '20',
        receivedAmount: '18',
        feeAmount: '2',
        feeAccountId: a,
        feeCategoryId: feeCategory,
        notes: 'Updated linked transfer',
      }).expect(200)
    ).body as Transfer;
    expect(edited.revision).toBe(2);
    expect(await balance(a)).toBe('78.0000');
    expect(await balance(b)).toBe('0.0000');
    expect(await balance(c)).toBe('18.0000');
    expect(await balance(f)).toBe('10.0000');
    const history = (
      await call('get', '/transfers/' + row.id + '/history').expect(200)
    ).body.items;
    expect(history[1].snapshot.destinationAccountId).toBe(b);
    expect(history[1].snapshot.feeAccountId).toBe(f);
    const details = (await call('get', '/accounts/' + b).expect(200)).body;
    expect(details.hasTransactions).toBe(true);
    await call('patch', '/accounts/' + b, {
      name: details.name,
      type: details.type,
      currency: details.currency,
      openingBalance: '1',
      openingBalanceDate: details.openingBalanceDate,
    }).expect(409);
    await remove(edited).expect(200);
    expect(await balance(a)).toBe('100.0000');
    expect(await balance(c)).toBe('0.0000');
  });
  test('idempotent create and deletion cannot duplicate or resurrect linked movements', async () => {
    const body = input();
    const responses = await Promise.all([
      call('post', '/transfers', body),
      call('post', '/transfers', body),
    ]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    const row = responses[0]!.body as Transfer;
    expect(responses[1]!.body.id).toBe(row.id);
    await call('post', '/transfers', {
      ...body,
      notes: 'Different payload',
    }).expect(409);
    await remove(row).expect(200);
    await remove(row).expect(200);
    const retried = (await call('post', '/transfers', body).expect(201)).body;
    expect(retried.deletedAt).not.toBeNull();
    expect(
      await db.transferRevision.count({ where: { transferId: row.id } }),
    ).toBe(2);
    await change({ ...row, revision: 2 }).expect(409);
  });
  test('concurrent and stale edits cannot overwrite either side or the fee', async () => {
    const row = await create();
    const results = await Promise.all([
      change(row, { notes: 'First editor' }),
      change(row, { notes: 'Second editor' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    await remove(row).expect(409);
    const latest = (await call('get', '/transfers/' + row.id).expect(200))
      .body as Transfer;
    await remove(latest).expect(200);
  });
  test('archival blocks every linked mutation until each involved account is restored', async () => {
    const row = await create({ feeAmount: '1', feeAccountId: yen });
    await call('post', '/accounts/' + yen + '/archive', {}).expect(200);
    await change(row, { feeAmount: '0', feeAccountId: null }).expect(409);
    await remove(row).expect(409);
    await call(
      'post',
      '/transfers',
      input({ feeAmount: '1', feeAccountId: yen }),
    ).expect(409);
    await call('post', '/accounts/' + yen + '/restore', {}).expect(200);
    await remove(row).expect(200);
    await call('post', '/accounts/' + destination + '/archive', {}).expect(200);
    await call('post', '/transfers', input()).expect(409);
    await call('post', '/accounts/' + destination + '/restore', {}).expect(200);
  });
  test('archived fee categories remain readable/retainable but cannot be newly assigned', async () => {
    const row = await create({
      feeAmount: '1',
      feeAccountId: source,
      feeCategoryId: feeCategory,
    });
    await call('post', '/categories/' + feeCategory + '/archive', {}).expect(
      200,
    );
    const edited = (
      await change(row, { notes: 'Keep historical fee category' }).expect(200)
    ).body as Transfer;
    await call(
      'post',
      '/transfers',
      input({
        feeAmount: '1',
        feeAccountId: source,
        feeCategoryId: feeCategory,
      }),
    ).expect(409);
    await remove(edited).expect(200);
    await call('post', '/categories/' + feeCategory + '/restore', {}).expect(
      200,
    );
  });
  test('overflow in create or edit rolls back every linked movement and revision', async () => {
    const full = await account('USD', '999999999999999.99');
    await call(
      'post',
      '/transfers',
      input({ destinationAccountId: full }),
    ).expect(409);
    const row = await create();
    const from = await balance(source),
      to = await balance(destination);
    await change(row, {
      destinationAccountId: full,
      feeAmount: '1',
      feeAccountId: yen,
    }).expect(409);
    expect(await balance(source)).toBe(from);
    expect(await balance(destination)).toBe(to);
    expect(
      (await call('get', '/transfers/' + row.id).expect(200)).body.revision,
    ).toBe(1);
    expect(
      await db.transferRevision.count({ where: { transferId: row.id } }),
    ).toBe(1);
    await remove(row).expect(200);
  });
  test('manual transaction bounds include transfers and transfer reversal cannot overflow silently', async () => {
    const a = await account('USD', '999999999999999.99'),
      b = await account();
    const row = await create({
      sourceAccountId: a,
      destinationAccountId: b,
      sentAmount: '1',
      receivedAmount: '1',
    });
    const manual = (
      await call('post', '/transactions', {
        requestId: randomUUID(),
        accountId: a,
        kind: 'income',
        amount: '1',
        date: '2026-01-02',
        splits: [{ categoryId: null, amount: '1' }],
      }).expect(201)
    ).body;
    await remove(row).expect(409);
    expect(await balance(b)).toBe('1.0000');
    expect(
      (await call('get', '/transfers/' + row.id).expect(200)).body.deletedAt,
    ).toBeNull();
    await call('post', '/transactions', {
      requestId: randomUUID(),
      accountId: a,
      kind: 'income',
      amount: '0.01',
      date: '2026-01-02',
      splits: [{ categoryId: null, amount: '0.01' }],
    }).expect(409);
    await call('delete', '/transactions/' + manual.id, { revision: 1 }).expect(
      200,
    );
    await remove(row).expect(200);
    expect(await balance(b)).toBe('0.0000');
  });
  test('database owner/type constraints and runtime append-only history protect references', async () => {
    const row = await create();
    await expect(
      db.financialTransfer.update({
        where: { id: row.id },
        data: { destinationAccountId: foreignAccount },
      }),
    ).rejects.toThrow();
    await expect(
      db.transferRevision.updateMany({
        where: { transferId: row.id },
        data: { action: 'deleted' },
      }),
    ).rejects.toThrow();
    await remove(row).expect(200);
  });
  test('account filters include the fee account and paging retains both linked sides', async () => {
    const a = await account(),
      b = await account(),
      f = await account('JPY', '100');
    for (let index = 0; index < 52; index++)
      await create({
        sourceAccountId: a,
        destinationAccountId: b,
        feeAmount: '1',
        feeAccountId: f,
      });
    const first = (await call('get', '/transfers?accountId=' + f).expect(200))
      .body;
    expect(first.items).toHaveLength(50);
    expect(first.nextCursor).not.toBeNull();
    const second = (
      await call(
        'get',
        '/transfers?accountId=' + f + '&after=' + first.nextCursor,
      ).expect(200)
    ).body;
    expect(second.items).toHaveLength(2);
    expect(
      new Set([...first.items, ...second.items].map((r: Transfer) => r.id))
        .size,
    ).toBe(52);
    const latest = first.items[0] as Transfer;
    await remove(latest).expect(200);
    expect(
      (
        await call('get', '/transfers?status=deleted&accountId=' + f).expect(
          200,
        )
      ).body.items,
    ).toHaveLength(1);
  });
  test('long history paginates snapshots without dropping old links or permitting invalid cursors', async () => {
    let row = await create();
    for (let i = 0; i < 51; i++)
      row = (await change(row, { notes: 'History ' + i }).expect(200))
        .body as Transfer;
    const first = (
      await call('get', '/transfers/' + row.id + '/history').expect(200)
    ).body;
    expect(first.items).toHaveLength(50);
    expect(first.nextRevision).toBe(3);
    const older = (
      await call('get', '/transfers/' + row.id + '/history?before=3').expect(
        200,
      )
    ).body;
    expect(older.items).toHaveLength(2);
    expect(older.items[1].action).toBe('created');
    await call(
      'get',
      '/transfers/' + row.id + '/history?before=9999999999999999',
    ).expect(400);
    await remove(row).expect(200);
  });
});
