import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import 'reflect-metadata';
import request from 'supertest';
import AppModule from '../../src/app.module';
import configureApp from '../../src/configure-app';
import PrismaService from '../../src/database/prisma.service';

describe('API contracts and isolation', () => {
  let app: NestExpressApplication;
  let db: PrismaService;
  const prefix = '/api/v1';
  const origin = 'http://localhost:3000';
  let aliceCookie: string;
  let bobCookie: string;
  let csrf: string;
  let bobCsrf: string;
  let accountId: string;
  let key: string;
  const emails = [
    randomUUID() + '@test.invalid',
    randomUUID() + '@test.invalid',
  ];
  const password = 'correct horse battery staple!';
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
  });
  afterAll(async () => {
    if (db) {
      const users = await db.user.findMany({
        where: { email: { in: emails } },
        select: { id: true },
      });
      await db.account.deleteMany({
        where: { userId: { in: users.map((u) => u.id) } },
      });
      await db.user.deleteMany({ where: { email: { in: emails } } });
    }
    if (app) await app.close();
  });
  test('minimal health responses and secure headers', async () => {
    for (const path of ['live', 'ready']) {
      const res = await request(app.getHttpServer())
        .get(prefix + '/health/' + path)
        .expect(200);
      expect(res.body).toEqual({ status: 'ok' });
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });
  test('denies anonymous access and normalizes errors', async () => {
    const res = await request(app.getHttpServer())
      .get(prefix + '/users/me')
      .expect(401);
    expect(res.type).toBe('application/problem+json');
    expect(res.body.code).toBe('UNAUTHENTICATED');
    expect(res.body.stack).toBeUndefined();
  });
  test('rejects missing origins, malformed JSON, and oversized payloads', async () => {
    await request(app.getHttpServer())
      .post(prefix + '/auth/signin')
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post(prefix + '/auth/signin')
      .set('Origin', origin)
      .set('Content-Type', 'application/json')
      .send('{broken')
      .expect(400);
    await request(app.getHttpServer())
      .post(prefix + '/auth/signin')
      .set('Origin', origin)
      .send({ password: 'x'.repeat(20000) })
      .expect(413);
  });
  test('accepts signup with generic duplicate responses', async () => {
    for (const email of emails) {
      const res = await request(app.getHttpServer())
        .post(prefix + '/auth/signup')
        .set('Origin', origin)
        .send({ email, password })
        .expect(201);
      expect(res.body).toEqual({ message: 'Signup request accepted.' });
    }
    const duplicate = await request(app.getHttpServer())
      .post(prefix + '/auth/signup')
      .set('Origin', origin)
      .send({ email: emails[0], password })
      .expect(201);
    expect(duplicate.body.message).toBe('Signup request accepted.');
  });
  test('returns the same signin failure for unknown and incorrect credentials', async () => {
    for (const email of [emails[0], 'missing@test.invalid']) {
      const res = await request(app.getHttpServer())
        .post(prefix + '/auth/signin')
        .set('Origin', origin)
        .send({ email, password: 'wrong' })
        .expect(401);
      expect(res.body.detail).toBe('Invalid email or password');
    }
  });
  test('logs in with HttpOnly sessions and safe profile', async () => {
    for (const [index, email] of emails.entries()) {
      const res = await request(app.getHttpServer())
        .post(prefix + '/auth/signin')
        .set('Origin', origin)
        .send({ email, password })
        .expect(200);
      const cookie = String(res.headers['set-cookie'][0]).split(';')[0];
      expect(String(res.headers['set-cookie'])).toContain('HttpOnly');
      if (index === 0) {
        aliceCookie = cookie;
        csrf = res.body.csrfToken;
      } else {
        bobCookie = cookie;
        bobCsrf = res.body.csrfToken;
      }
    }
    const me = await request(app.getHttpServer())
      .get(prefix + '/users/me')
      .set('Cookie', aliceCookie)
      .expect(200);
    expect(Object.keys(me.body).sort()).toEqual(['createdAt', 'email', 'id']);
  });
  test('rejects CSRF failure, untrusted origins, and ownership injection', async () => {
    await request(app.getHttpServer())
      .post(prefix + '/accounts')
      .set('Cookie', aliceCookie)
      .set('Origin', origin)
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post(prefix + '/accounts')
      .set('Cookie', aliceCookie)
      .set('Origin', 'http://evil.invalid')
      .set('X-CSRF-Token', csrf)
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post(prefix + '/accounts')
      .set('Cookie', aliceCookie)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .set('Idempotency-Key', randomUUID())
      .send({
        name: 'Cash',
        currency: 'USD',
        openingBalance: '0',
        userId: randomUUID(),
      })
      .expect(400);
  });
  test('creates idempotently and preserves decimal strings', async () => {
    key = randomUUID();
    const dto = { name: 'Cash', currency: 'USD', openingBalance: '0.1000' };
    const make = () =>
      request(app.getHttpServer())
        .post(prefix + '/accounts')
        .set('Cookie', aliceCookie)
        .set('Origin', origin)
        .set('X-CSRF-Token', csrf)
        .set('Idempotency-Key', key);
    const first = await make().send(dto).expect(201);
    accountId = first.body.id;
    expect(first.body.openingBalance).toBe('0.1000');
    const second = await make().send(dto).expect(201);
    expect(second.body.id).toBe(accountId);
    await make()
      .send({ ...dto, name: 'Changed' })
      .expect(409);
  });
  test('prevents cross-user reads, updates, and deletes', async () => {
    await request(app.getHttpServer())
      .get(prefix + '/accounts/' + accountId)
      .set('Cookie', bobCookie)
      .expect(404);
    for (const method of ['patch', 'delete'] as const) {
      const req = request(app.getHttpServer())
        [method](prefix + '/accounts/' + accountId)
        .set('Cookie', bobCookie)
        .set('Origin', origin)
        .set('X-CSRF-Token', bobCsrf);
      await (method === 'patch' ? req.send({ name: 'Stolen' }) : req).expect(
        404,
      );
    }
    const list = await request(app.getHttpServer())
      .get(prefix + '/accounts')
      .set('Cookie', bobCookie)
      .expect(200);
    expect(list.body.data).toEqual([]);
    await request(app.getHttpServer())
      .get(prefix + '/accounts?cursor=' + accountId)
      .set('Cookie', bobCookie)
      .expect(404);
  });
  test('allows rename and archive without modifying historical amount', async () => {
    const res = await request(app.getHttpServer())
      .patch(prefix + '/accounts/' + accountId)
      .set('Cookie', aliceCookie)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .send({ name: 'Renamed' })
      .expect(200);
    expect(res.body.openingBalance).toBe('0.1000');
    await request(app.getHttpServer())
      .delete(prefix + '/accounts/' + accountId)
      .set('Cookie', aliceCookie)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .expect(204);
    await request(app.getHttpServer())
      .get(prefix + '/accounts/' + accountId)
      .set('Cookie', aliceCookie)
      .expect(404);
    expect(await db.account.count({ where: { id: accountId } })).toBe(1);
  });
  test('rotates presented sessions and rejects expired sessions', async () => {
    const previous = bobCookie;
    const signedIn = await request(app.getHttpServer())
      .post(prefix + '/auth/signin')
      .set('Origin', origin)
      .set('Cookie', previous)
      .send({ email: emails[1], password })
      .expect(200);
    bobCookie = String(signedIn.headers['set-cookie'][0]).split(';')[0];
    await request(app.getHttpServer())
      .get(prefix + '/users/me')
      .set('Cookie', previous)
      .expect(401);
    await db.session.updateMany({
      where: { user: { email: emails[1] } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(app.getHttpServer())
      .get(prefix + '/users/me')
      .set('Cookie', bobCookie)
      .expect(401);
  });

  test('signout invalidates the server session', async () => {
    await request(app.getHttpServer())
      .post(prefix + '/auth/signout')
      .set('Cookie', aliceCookie)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .expect(204);
    await request(app.getHttpServer())
      .get(prefix + '/users/me')
      .set('Cookie', aliceCookie)
      .expect(401);
  });
  test('rate limits authentication attempts', async () => {
    let limited = false;
    for (let i = 0; i < 105; i++) {
      const res = await request(app.getHttpServer())
        .post(prefix + '/auth/signin')
        .set('Origin', origin)
        .send({});
      if (res.status === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });
});
