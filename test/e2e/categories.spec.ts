import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import 'reflect-metadata';
import request from 'supertest';
import AppModule from '../../src/app.module';
import configureApp from '../../src/configure-app';
import PrismaService from '../../src/database/prisma.service';
import type { Category } from '../../src/generated/prisma/client';
import type { CategoryInput } from '../../src/modules/categories/categories.dto';
import CategoriesService from '../../src/modules/categories/categories.service';

describe('categories and history-safe ownership', () => {
  let app: NestExpressApplication;
  let db: PrismaService;
  let service: CategoriesService;
  let ownerId: string;
  let otherId: string;
  let cookie: string;
  let otherCookie: string;
  let csrf: string;
  let otherCsrf: string;
  let food: string;
  let groceries: string;
  let salary: string;
  let transport: string;
  const prefix = '/api/v1/categories';
  const origin = 'http://localhost:3000';
  const emails = [
    randomUUID() + '@test.invalid',
    randomUUID() + '@test.invalid',
  ];
  const redisPrefix = process.env.REDIS_KEY_PREFIX;
  const input: CategoryInput = {
    name: 'Food',
    kind: 'expense',
    color: 'orange',
    icon: 'food',
    parentId: null,
    description: '',
  };
  const post = (path: string, body: object = {}) =>
    request(app.getHttpServer())
      .post(prefix + path)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send(body);
  const patch = (id: string, body: object) =>
    request(app.getHttpServer())
      .patch(prefix + '/' + id)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send(body);
  const list = () =>
    request(app.getHttpServer()).get(prefix).set('Cookie', cookie).expect(200);
  const create = async (body: Partial<CategoryInput>) => {
    const result = await post('', { ...input, ...body }).expect(201);
    return result.body.items.find(
      (item: Category) =>
        item.name === (body.name ?? input.name) &&
        item.parentId === (body.parentId ?? null),
    ).id as string;
  };
  beforeAll(async () => {
    if (
      process.env.NODE_ENV !== 'test' ||
      !process.env.POSTGRES_DB?.endsWith('_test')
    )
      throw Error('Use an isolated _test database');
    process.env.REDIS_KEY_PREFIX = redisPrefix + ':categories:' + randomUUID();
    app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: false,
      bodyParser: false,
    });
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    service = app.get(CategoriesService);
    for (const [index, email] of emails.entries()) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .set('Origin', origin)
        .send({ email, password: 'Category test passphrase, long and unique!' })
        .expect(201);
      const signin = await request(app.getHttpServer())
        .post('/api/v1/auth/signin')
        .set('Origin', origin)
        .send({ email, password: 'Category test passphrase, long and unique!' })
        .expect(200);
      const saved = String(signin.headers['set-cookie'][0]).split(';')[0]!;
      const user = await db.user.findUniqueOrThrow({ where: { email } });
      if (index === 0) {
        cookie = saved;
        csrf = signin.body.csrfToken;
        ownerId = user.id;
      } else {
        otherCookie = saved;
        otherCsrf = signin.body.csrfToken;
        otherId = user.id;
      }
    }
  });
  afterAll(async () => {
    if (db) await db.user.deleteMany({ where: { email: { in: emails } } });
    if (app) await app.close();
    process.env.REDIS_KEY_PREFIX = redisPrefix;
  });

  test('requires a session and CSRF; starts without seeded categories', async () => {
    await request(app.getHttpServer()).get(prefix).expect(401);
    await request(app.getHttpServer())
      .post(prefix)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(input)
      .expect(403);
    expect((await list()).body.items).toEqual([]);
  });
  test('creates income, expenses and subcategories without exposing ownership', async () => {
    food = await create({});
    salary = await create({ name: 'Salary', kind: 'income', icon: 'income' });
    groceries = await create({ name: 'Groceries', parentId: food });
    transport = await create({ name: 'Transport', icon: 'transport' });
    const rows = (await list()).body.items;
    expect(rows).toHaveLength(4);
    expect(
      rows.every((row: { userId?: string }) => row.userId === undefined),
    ).toBe(true);
    expect(rows.find((row: Category) => row.id === groceries).parentId).toBe(
      food,
    );
  });
  test('isolates reads, updates, archive/restore, ordering and parent selection', async () => {
    expect(
      (
        await request(app.getHttpServer())
          .get(prefix)
          .set('Cookie', otherCookie)
          .expect(200)
      ).body.items,
    ).toEqual([]);
    await request(app.getHttpServer())
      .get(prefix + '/' + food)
      .set('Cookie', otherCookie)
      .expect(404);
    await request(app.getHttpServer())
      .patch(prefix + '/' + food)
      .set('Origin', origin)
      .set('Cookie', otherCookie)
      .set('X-CSRF-Token', otherCsrf)
      .send(input)
      .expect(404);
    for (const action of ['archive', 'restore', 'move'])
      await request(app.getHttpServer())
        .post(prefix + '/' + food + '/' + action)
        .set('Origin', origin)
        .set('Cookie', otherCookie)
        .set('X-CSRF-Token', otherCsrf)
        .send(action === 'move' ? { direction: 'up' } : {})
        .expect(404);
    await request(app.getHttpServer())
      .post(prefix)
      .set('Origin', origin)
      .set('Cookie', otherCookie)
      .set('X-CSRF-Token', otherCsrf)
      .send({ ...input, parentId: food })
      .expect(404);
  });
  test('rejects invalid details, unexpected ownership fields and malformed actions', async () => {
    for (const invalid of [
      { name: ' ' },
      { name: 'x'.repeat(61) },
      { name: 'bad\u0000name' },
      { kind: 'transfer' },
      { color: '#ffffff' },
      { icon: '<script>' },
      { parentId: 'invalid' },
      { description: 'bad\nline' },
      { description: 'x'.repeat(241) },
      { userId: otherId },
      { position: -1 },
    ])
      await post('', { ...input, ...invalid }).expect(400);
    await post('/' + food + '/move', { direction: 'left' }).expect(400);
    await request(app.getHttpServer())
      .delete(prefix + '/' + food)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .expect(404);
  });
  test('prevents type changes, self-parenting, deeper nesting and cycles', async () => {
    await patch(food, { ...input, kind: 'income' }).expect(409);
    await patch(food, { ...input, parentId: food }).expect(409);
    await patch(food, { ...input, parentId: groceries }).expect(409);
    await post('', {
      ...input,
      name: 'Third level',
      parentId: groceries,
    }).expect(409);
    await post('', { ...input, name: 'Wrong type', parentId: salary }).expect(
      409,
    );
  });
  test('reserves names case-insensitively within a sibling group, not globally', async () => {
    await post('', { ...input, name: ' food ' }).expect(409);
    await post('', { ...input, name: 'Ｆｏｏｄ' }).expect(409);
    await post('', { ...input, name: 'groceries', parentId: food }).expect(409);
    await create({ name: 'Food', kind: 'income' });
    await create({ name: 'Groceries', parentId: transport });
  });
  test('customizes and reparents categories without changing their identity or type', async () => {
    const result = await patch(groceries, {
      ...input,
      name: 'Weekly shop',
      parentId: transport,
      color: 'blue',
      icon: 'shopping',
      description: ' Household food ',
    }).expect(200);
    expect(
      result.body.items.find((row: Category) => row.id === groceries),
    ).toMatchObject({
      name: 'Weekly shop',
      parentId: transport,
      color: 'blue',
      description: 'Household food',
      kind: 'expense',
    });
    await patch(groceries, {
      ...input,
      name: 'Groceries',
      parentId: food,
    }).expect(200);
  });
  test('persists root and sibling ordering without crossing income or parent groups', async () => {
    const roots = (rows: Category[]) =>
      rows
        .filter((row) => row.kind === 'expense' && row.parentId === null)
        .map((row) => row.id);
    expect(
      roots(
        (await post('/' + transport + '/move', { direction: 'up' }).expect(200))
          .body.items,
      ),
    ).toEqual([transport, food]);
    expect(roots((await list()).body.items)).toEqual([transport, food]);
    await post('/' + transport + '/move', { direction: 'down' }).expect(200);
    await create({ name: 'Dining', parentId: food });
    const response = await post('/' + groceries + '/move', {
      direction: 'down',
    }).expect(200);
    expect(
      response.body.items
        .filter((row: Category) => row.parentId === food)
        .map((row: Category) => row.name),
    ).toEqual(['Dining', 'Groceries']);
  });
  test('archives the whole branch, preserves previous timestamps and restores explicitly', async () => {
    const child = await post('/' + groceries + '/archive').expect(200);
    const archivedAt = child.body.items.find(
      (row: Category) => row.id === groceries,
    ).archivedAt;
    const first = await post('/' + food + '/archive').expect(200);
    expect(
      first.body.items.find((row: Category) => row.id === groceries).archivedAt,
    ).toBe(archivedAt);
    const parentTime = first.body.items.find(
      (row: Category) => row.id === food,
    ).archivedAt;
    const second = await post('/' + food + '/archive').expect(200);
    expect(
      second.body.items.find((row: Category) => row.id === food).archivedAt,
    ).toBe(parentTime);
    await patch(food, input).expect(409);
    await post('/' + food + '/move', { direction: 'up' }).expect(409);
    await post('/' + groceries + '/restore').expect(409);
    await post('', input).expect(409);
    await expect(
      db.$transaction((tx) =>
        service.requireAssignable(tx, ownerId, food, 'expense'),
      ),
    ).rejects.toThrow();
    const restored = await post('/' + food + '/restore').expect(200);
    expect(
      restored.body.items.find((row: Category) => row.id === food).archivedAt,
    ).toBeNull();
    expect(
      restored.body.items.find((row: Category) => row.id === groceries)
        .archivedAt,
    ).toBe(archivedAt);
    await post('/' + groceries + '/restore').expect(200);
  });
  test('future ledger guard rejects foreign and mismatched categories and accepts a restored child', async () => {
    expect(
      (
        await db.$transaction((tx) =>
          service.requireAssignable(tx, ownerId, groceries, 'expense'),
        )
      ).id,
    ).toBe(groceries);
    await expect(
      db.$transaction((tx) =>
        service.requireAssignable(tx, ownerId, groceries, 'income'),
      ),
    ).rejects.toThrow();
    await expect(
      db.$transaction((tx) =>
        service.requireAssignable(tx, otherId, groceries, 'expense'),
      ),
    ).rejects.toThrow();
    await expect(
      db.category.create({
        data: { ...input, userId: otherId, parentId: food },
      }),
    ).rejects.toThrow();
    await expect(
      db.category.create({
        data: {
          ...input,
          userId: ownerId,
          name: 'Invalid parent kind',
          parentId: salary,
        },
      }),
    ).rejects.toThrow();
  });
  test('serializes concurrent duplicate creation and archive/child-creation races', async () => {
    const duplicates = await Promise.all([
      post('', { ...input, name: 'Concurrent' }),
      post('', { ...input, name: 'Concurrent' }),
    ]);
    expect(duplicates.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const raced = await Promise.all([
      post('/' + food + '/archive'),
      post('', { ...input, name: 'Racing child', parentId: food }),
    ]);
    expect(raced[0]!.status).toBe(200);
    expect([201, 409]).toContain(raced[1]!.status);
    const rows = (await list()).body.items as Category[];
    expect(
      rows
        .filter((row) => row.parentId === food)
        .every((row) => row.archivedAt !== null),
    ).toBe(true);
  });
  test('caps the bounded collection including archives, with no destructive reset', async () => {
    const count = await db.category.count({ where: { userId: ownerId } });
    await db.category.createMany({
      data: Array.from({ length: 500 - count }, (_, index) => ({
        ...input,
        description: null,
        name: 'Limit ' + index,
        userId: ownerId,
        position: 100 + index,
      })),
    });
    await post('', { ...input, name: 'Beyond limit' }).expect(409);
    expect((await list()).body.items).toHaveLength(500);
  });
});
