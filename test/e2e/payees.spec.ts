import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import 'reflect-metadata';
import request from 'supertest';
import AppModule from '../../src/app.module';
import configureApp from '../../src/configure-app';
import PrismaService from '../../src/database/prisma.service';
import PayeesService from '../../src/modules/payees/payees.service';

describe('payees, search and history-preserving merges', () => {
  let app: NestExpressApplication;
  let db: PrismaService;
  let service: PayeesService;
  let ownerId: string;
  let otherId: string;
  let cookie: string;
  let otherCookie: string;
  let csrf: string;
  let otherCsrf: string;
  let survivor: string;
  let duplicate: string;
  let person: string;
  let organization: string;
  const origin = 'http://localhost:3000';
  const prefix = '/api/v1/payees';
  const emails = [
    randomUUID() + '@test.invalid',
    randomUUID() + '@test.invalid',
  ];
  const oldPrefix = process.env.REDIS_KEY_PREFIX;
  const input = {
    name: 'North Market',
    kind: 'merchant',
    notes: 'Keep these notes',
  };
  const post = (path: string, body: object = {}) =>
    request(app.getHttpServer())
      .post(prefix + path)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .send(body);
  const patch = (id: string, body: object) =>
    request(app.getHttpServer())
      .patch(prefix + '/' + id)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .send(body);
  const list = (query = '') =>
    request(app.getHttpServer())
      .get(prefix + query)
      .set('Cookie', cookie)
      .expect(200);
  const get = (id: string) =>
    request(app.getHttpServer())
      .get(prefix + '/' + id)
      .set('Cookie', cookie)
      .expect(200);
  const create = async (name: string, kind = 'merchant', notes = '') =>
    (await post('', { name, kind, notes }).expect(201)).body.id as string;
  beforeAll(async () => {
    if (
      process.env.NODE_ENV !== 'test' ||
      !process.env.POSTGRES_DB?.endsWith('_test')
    )
      throw Error('Use an isolated _test database');
    process.env.REDIS_KEY_PREFIX = oldPrefix + ':payees:' + randomUUID();
    app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: false,
      bodyParser: false,
    });
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    service = app.get(PayeesService);
    for (const [index, email] of emails.entries()) {
      const password = 'Payee testing passphrase that is long and unique!';
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
      const saved = String(response.headers['set-cookie'][0]).split(';')[0]!;
      const row = await db.user.findUniqueOrThrow({ where: { email } });
      if (index === 0) {
        cookie = saved;
        csrf = response.body.csrfToken;
        ownerId = row.id;
      } else {
        otherCookie = saved;
        otherCsrf = response.body.csrfToken;
        otherId = row.id;
      }
    }
  });
  afterAll(async () => {
    if (db) await db.user.deleteMany({ where: { email: { in: emails } } });
    if (app) await app.close();
    process.env.REDIS_KEY_PREFIX = oldPrefix;
  });

  test('requires session/CSRF and starts without sample payees', async () => {
    await request(app.getHttpServer()).get(prefix).expect(401);
    await request(app.getHttpServer())
      .post(prefix)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send(input)
      .expect(403);
    expect((await list()).body).toEqual({ items: [], nextCursor: null });
  });
  test('creates all kinds and permits genuinely distinct entities with the same name', async () => {
    survivor = (await post('', input).expect(201)).body.id;
    duplicate = await create(
      'Market North',
      'merchant',
      'Source notes retained',
    );
    person = await create('Alex', 'person');
    organization = await create(
      'Local Club',
      'organization',
      'Organization notes',
    );
    const first = await create('Same name', 'person');
    const second = await create('Same name', 'person');
    expect(first).not.toBe(second);
    expect((await get(survivor)).body).toMatchObject({
      name: input.name,
      mergedNameCount: 0,
      mergedIntoId: null,
      archivedAt: null,
    });
    expect((await get(survivor)).body.userId).toBeUndefined();
  });
  test('isolates every read, write, merge source, target and pagination cursor', async () => {
    const other = (path: string, body: object) =>
      request(app.getHttpServer())
        .post(prefix + path)
        .set('Cookie', otherCookie)
        .set('Origin', origin)
        .set('X-CSRF-Token', otherCsrf)
        .send(body);
    const otherPayee = (await other('', input).expect(201)).body.id as string;
    await request(app.getHttpServer())
      .get(prefix + '/' + survivor)
      .set('Cookie', otherCookie)
      .expect(404);
    await request(app.getHttpServer())
      .patch(prefix + '/' + survivor)
      .set('Cookie', otherCookie)
      .set('Origin', origin)
      .set('X-CSRF-Token', otherCsrf)
      .send(input)
      .expect(404);
    for (const action of ['archive', 'restore'])
      await other('/' + survivor + '/' + action, {}).expect(404);
    await other('/' + survivor + '/merge', { targetId: otherPayee }).expect(
      404,
    );
    await post('/' + duplicate + '/merge', { targetId: otherPayee }).expect(
      404,
    );
    await request(app.getHttpServer())
      .get(prefix + '?after=' + survivor)
      .set('Cookie', otherCookie)
      .expect(404);
    const rows = (await list()).body.items as Array<{ id: string }>;
    expect(rows.some((row) => row.id === otherPayee)).toBe(false);
  });
  test('rejects invalid fields, ownership injection and unsupported query/actions', async () => {
    for (const invalid of [
      { name: ' ' },
      { name: 'x'.repeat(101) },
      { name: 'bad\u0000name' },
      { kind: 'bank' },
      { notes: 'x'.repeat(501) },
      { notes: 'bad\u0000note' },
      { userId: otherId },
      { mergedIntoId: survivor },
    ])
      await post('', { ...input, ...invalid }).expect(400);
    for (const query of [
      '?kind=all',
      '?status=all',
      '?q=' + 'x'.repeat(101),
      '?after=invalid',
    ])
      await request(app.getHttpServer())
        .get(prefix + query)
        .set('Cookie', cookie)
        .expect(400);
    await post('/' + duplicate + '/merge', { targetId: 'invalid' }).expect(400);
    await request(app.getHttpServer())
      .delete(prefix + '/' + survivor)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .expect(404);
  });
  test('searches normalized names and notes, with literal wildcard characters', async () => {
    const literal = await create('Discount 50%', 'merchant', 'Reference_A');
    await create('Discount 50X', 'merchant', 'ReferenceXA');
    expect(
      (await list('?q=north&kind=merchant')).body.items.map(
        (row: { id: string }) => row.id,
      ),
    ).toEqual(expect.arrayContaining([survivor, duplicate]));
    expect(
      (await list('?q=50%25')).body.items.map((row: { id: string }) => row.id),
    ).toEqual([literal]);
    expect(
      (await list('?q=Reference_A')).body.items.map(
        (row: { id: string }) => row.id,
      ),
    ).toEqual([literal]);
    expect((await list('?q=alex&kind=merchant')).body.items).toEqual([]);
  });
  test('renames and corrects type without replacing the identity; notes can be cleared', async () => {
    const renamed = await patch(person, {
      name: ' Ａｌｅｘ   Smith ',
      kind: 'organization',
      notes: ' Line one\nLine two ',
    }).expect(200);
    expect(renamed.body).toMatchObject({
      id: person,
      name: 'Alex Smith',
      kind: 'organization',
      notes: 'Line one\nLine two',
    });
    expect(
      (
        await patch(person, {
          name: 'Alex Smith',
          kind: 'person',
          notes: '',
        }).expect(200)
      ).body.notes,
    ).toBeNull();
  });
  test('archives idempotently, keeps details, and restores before editing', async () => {
    const first = await post('/' + person + '/archive').expect(200);
    expect(
      (await post('/' + person + '/archive').expect(200)).body.archivedAt,
    ).toBe(first.body.archivedAt);
    await patch(person, { name: 'Changed', kind: 'person' }).expect(409);
    expect(
      (await list('?status=archived')).body.items.map(
        (row: { id: string }) => row.id,
      ),
    ).toContain(person);
    await expect(
      db.$transaction((tx) => service.requireAssignable(tx, ownerId, person)),
    ).rejects.toThrow();
    await post('/' + person + '/restore').expect(200);
    expect((await get(person)).body.name).toBe('Alex Smith');
  });
  test('merges into the chosen survivor, preserving both identities and source details', async () => {
    const merged = await post('/' + duplicate + '/merge', {
      targetId: survivor,
    }).expect(200);
    expect(merged.body).toMatchObject({
      id: survivor,
      name: input.name,
      notes: input.notes,
      mergedNameCount: 1,
    });
    const source = (await get(duplicate)).body;
    expect(source).toMatchObject({
      name: 'Market North',
      notes: 'Source notes retained',
      mergedIntoId: survivor,
      mergedIntoName: input.name,
    });
    expect(source.archivedAt).toBeTruthy();
    expect(source.mergedAt).toBeTruthy();
    await post('/' + duplicate + '/merge', { targetId: survivor }).expect(200);
    expect((await get(duplicate)).body.mergedAt).toBe(source.mergedAt);
    expect(
      (await list('?q=Market%20North')).body.items.map(
        (row: { id: string }) => row.id,
      ),
    ).toEqual([survivor]);
    expect(
      (await list('?status=merged')).body.items.map(
        (row: { id: string }) => row.id,
      ),
    ).toContain(duplicate);
    expect(
      (await list('?status=archived')).body.items.map(
        (row: { id: string }) => row.id,
      ),
    ).not.toContain(duplicate);
  });
  test('merged sources are read-only; targets must be distinct active canonical payees', async () => {
    await patch(duplicate, input).expect(409);
    for (const action of ['archive', 'restore'])
      await post('/' + duplicate + '/' + action).expect(409);
    await post('/' + survivor + '/merge', { targetId: survivor }).expect(409);
    await post('/' + person + '/merge', { targetId: duplicate }).expect(409);
    await post('/' + organization + '/archive').expect(200);
    await post('/' + person + '/merge', { targetId: organization }).expect(409);
    await post('/' + organization + '/restore').expect(200);
  });
  test('flattens chains and resolves archived historical identities without losing notes', async () => {
    const previous = await post('/' + survivor + '/archive').expect(200);
    await post('/' + survivor + '/merge', { targetId: organization }).expect(
      200,
    );
    expect((await get(survivor)).body.archivedAt).toBe(
      previous.body.archivedAt,
    );
    expect((await get(duplicate)).body.mergedIntoId).toBe(organization);
    expect((await get(organization)).body).toMatchObject({
      name: 'Local Club',
      notes: 'Organization notes',
      mergedNameCount: 2,
    });
    expect(
      (
        await db.$transaction((tx) =>
          service.requireAssignable(tx, ownerId, duplicate),
        )
      ).id,
    ).toBe(organization);
    await post('/' + organization + '/archive').expect(200);
    await expect(
      db.$transaction((tx) =>
        service.requireAssignable(tx, ownerId, duplicate),
      ),
    ).rejects.toThrow();
    expect(
      (
        await db.$transaction((tx) =>
          service.resolveForHistory(tx, ownerId, duplicate),
        )
      ).id,
    ).toBe(organization);
    await post('/' + organization + '/restore').expect(200);
    await expect(
      db.$transaction((tx) =>
        service.requireAssignable(tx, otherId, duplicate),
      ),
    ).rejects.toThrow();
  });
  test('database merge references enforce ownership and reject self-links', async () => {
    await expect(
      db.payee.create({
        data: {
          ...input,
          userId: otherId,
          mergedIntoId: organization,
          archivedAt: new Date(),
          mergedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
    const id = randomUUID();
    await expect(
      db.payee.create({
        data: {
          ...input,
          id,
          userId: ownerId,
          mergedIntoId: id,
          archivedAt: new Date(),
          mergedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });
  test('opposing concurrent merges cannot form a cycle', async () => {
    const a = await create('Race A');
    const b = await create('Race B');
    const responses = await Promise.all([
      post('/' + a + '/merge', { targetId: b }),
      post('/' + b + '/merge', { targetId: a }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const resolved = await db.$transaction(async (tx) => [
      (await service.resolveForHistory(tx, ownerId, a)).id,
      (await service.resolveForHistory(tx, ownerId, b)).id,
    ]);
    expect(resolved[0]).toBe(resolved[1]);
  });
  test('merge/archive races never leave an archived survivor assignable', async () => {
    const source = await create('Archive race source');
    const target = await create('Archive race target');
    const results = await Promise.all([
      post('/' + target + '/archive'),
      post('/' + source + '/merge', { targetId: target }),
    ]);
    expect(results[0]!.status).toBe(200);
    expect([200, 409]).toContain(results[1]!.status);
    await expect(
      db.$transaction((tx) => service.requireAssignable(tx, ownerId, target)),
    ).rejects.toThrow();
    if (results[1]!.status === 200)
      await expect(
        db.$transaction((tx) => service.requireAssignable(tx, ownerId, source)),
      ).rejects.toThrow();
  });
  test('paginates consistently without crossing owners, including tied timestamps', async () => {
    const now = new Date();
    await db.payee.createMany({
      data: Array.from({ length: 61 }, (_, index) => ({
        userId: ownerId,
        name: 'Paging ' + index,
        kind: 'merchant',
        createdAt: now,
      })),
    });
    const first = (await list('?q=Paging')).body;
    expect(first.items).toHaveLength(50);
    expect(first.nextCursor).toBeTruthy();
    const second = (await list('?q=Paging&after=' + first.nextCursor)).body;
    expect(second.items).toHaveLength(11);
    expect(second.nextCursor).toBeNull();
    expect(
      new Set(
        [...first.items, ...second.items].map((row: { id: string }) => row.id),
      ).size,
    ).toBe(61);
    expect(
      (
        await list('?excludeId=' + first.items[0].id + '&q=Paging')
      ).body.items.some((row: { id: string }) => row.id === first.items[0].id),
    ).toBe(false);
  });
});
