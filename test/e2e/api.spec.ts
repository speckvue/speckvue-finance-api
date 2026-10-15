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
      }
    }
    const me = await request(app.getHttpServer())
      .get(prefix + '/users/me')
      .set('Cookie', aliceCookie)
      .expect(200);
    expect(me.body.email).toBe(emails[0]);
    expect(me.body.onboardedAt).toBeNull();
    expect(me.body.passwordHash).toBeUndefined();
    expect(me.body.credentialsVersion).toBeUndefined();
  });
  test('removed financial routes are unavailable', async () => {
    await request(app.getHttpServer())
      .get(prefix + '/accounts')
      .set('Cookie', aliceCookie)
      .expect(404);
  });
  test('rejects missing CSRF tokens and untrusted origins', async () => {
    await request(app.getHttpServer())
      .post(prefix + '/auth/signout')
      .set('Cookie', aliceCookie)
      .set('Origin', origin)
      .expect(403);
    await request(app.getHttpServer())
      .post(prefix + '/auth/signout')
      .set('Cookie', aliceCookie)
      .set('Origin', 'http://evil.invalid')
      .set('X-CSRF-Token', csrf)
      .expect(403);
  });
  test('onboarding validates preferences and isolates users', async () => {
    const values = {
      displayName: 'Alex',
      baseCurrency: 'INR',
      locale: 'en-IN',
      timezone: 'Asia/Kolkata',
      theme: 'dark',
      weekStartsOn: 1,
    };
    const save = (body: object) =>
      request(app.getHttpServer())
        .post(prefix + '/users/me/onboarding')
        .set('Cookie', aliceCookie)
        .set('Origin', origin)
        .set('X-CSRF-Token', csrf)
        .send(body);
    await save({ ...values, userId: 'injected' }).expect(400);
    await save({ ...values, timezone: 'Invalid/Zone' }).expect(400);
    await save({ ...values, baseCurrency: 'ZZZ' }).expect(400);
    await save({ ...values, displayName: '   ' }).expect(400);
    const first = await save(values).expect(200);
    expect(first.body.displayName).toBe('Alex');
    expect(first.body.onboardedAt).toEqual(expect.any(String));
    const again = await save(values).expect(200);
    expect(again.body.onboardedAt).toBe(first.body.onboardedAt);
    const other = await request(app.getHttpServer())
      .get(prefix + '/users/me')
      .set('Cookie', bobCookie)
      .expect(200);
    expect(other.body.onboardedAt).toBeNull();
    const changed = await request(app.getHttpServer())
      .patch(prefix + '/users/me/preferences')
      .set('Cookie', aliceCookie)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .send({
        ...values,
        theme: 'light',
        locale: 'de-DE',
        timezone: 'Europe/Berlin',
      })
      .expect(200);
    expect(changed.body.theme).toBe('light');
    expect(changed.body.onboardedAt).toBe(first.body.onboardedAt);
  });
  test('session list omits secrets and revocation is owner scoped', async () => {
    const response = await request(app.getHttpServer())
      .get(prefix + '/auth/sessions')
      .set('Cookie', aliceCookie)
      .expect(200);
    expect(response.body[0].current).toBe(true);
    expect(Object.keys(response.body[0]).sort()).toEqual([
      'createdAt',
      'current',
      'expiresAt',
      'id',
    ]);
    const bob = await request(app.getHttpServer())
      .get(prefix + '/auth/sessions')
      .set('Cookie', bobCookie)
      .expect(200);
    await request(app.getHttpServer())
      .delete(prefix + '/auth/sessions/' + bob.body[0].id)
      .set('Cookie', aliceCookie)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .expect(404);
    const another = await request(app.getHttpServer())
      .post(prefix + '/auth/signin')
      .set('Origin', origin)
      .send({ email: emails[0], password })
      .expect(200);
    const anotherCookie = String(another.headers['set-cookie'][0]).split(
      ';',
    )[0];
    const list = await request(app.getHttpServer())
      .get(prefix + '/auth/sessions')
      .set('Cookie', aliceCookie)
      .expect(200);
    const target = list.body.find(
      (session: { current: boolean }) => !session.current,
    );
    await request(app.getHttpServer())
      .delete(prefix + '/auth/sessions/' + target.id)
      .set('Cookie', aliceCookie)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .expect(204);
    await request(app.getHttpServer())
      .get(prefix + '/users/me')
      .set('Cookie', anotherCookie)
      .expect(401);
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
  test('password changes reject bad passwords and invalidate every session', async () => {
    const signin = () =>
      request(app.getHttpServer())
        .post(prefix + '/auth/signin')
        .set('Origin', origin)
        .send({ email: emails[0], password })
        .expect(200);
    const first = await signin();
    const second = await signin();
    const cookie = String(first.headers['set-cookie'][0]).split(';')[0];
    const secondCookie = String(second.headers['set-cookie'][0]).split(';')[0];
    const change = (currentPassword: string) =>
      request(app.getHttpServer())
        .post(prefix + '/auth/password')
        .set('Cookie', cookie)
        .set('Origin', origin)
        .set('X-CSRF-Token', first.body.csrfToken)
        .send({ currentPassword, newPassword: password + 'new' });
    await change('wrong').expect(401);
    await change(password).expect(204);
    for (const c of [cookie, secondCookie])
      await request(app.getHttpServer())
        .get(prefix + '/users/me')
        .set('Cookie', c)
        .expect(401);
    await request(app.getHttpServer())
      .post(prefix + '/auth/signin')
      .set('Origin', origin)
      .send({ email: emails[0], password })
      .expect(401);
    const next = await request(app.getHttpServer())
      .post(prefix + '/auth/signin')
      .set('Origin', origin)
      .send({ email: emails[0], password: password + 'new' })
      .expect(200);
    const nextCookie = String(next.headers['set-cookie'][0]).split(';')[0];
    await request(app.getHttpServer())
      .get(prefix + '/users/me')
      .set('Cookie', nextCookie)
      .expect(200);
    await request(app.getHttpServer())
      .post(prefix + '/auth/signout-all')
      .set('Cookie', nextCookie)
      .set('Origin', origin)
      .set('X-CSRF-Token', next.body.csrfToken)
      .expect(204);
    await request(app.getHttpServer())
      .get(prefix + '/users/me')
      .set('Cookie', nextCookie)
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
