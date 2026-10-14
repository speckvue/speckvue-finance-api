import databaseUrl from '../../src/config/database-url';
import validate from '../../src/config/validation';

describe('configuration', () => {
  test('rejects insecure production settings', () => {
    expect(() => validate({ ...process.env, NODE_ENV: 'production' })).toThrow(
      'Production requires',
    );
  });
  test('rejects wildcard origins and insecure cross-site cookies', () => {
    expect(() => validate({ ...process.env, CORS_ORIGINS: '*' })).toThrow();
    expect(() =>
      validate({
        ...process.env,
        COOKIE_SAME_SITE: 'none',
        COOKIE_SECURE: 'false',
      }),
    ).toThrow();
  });
  test('encodes special database password characters', () => {
    const settings = validate({
      ...process.env,
      POSTGRES_PASSWORD: 'p@ss/:?#%value-123456',
    });
    const url = new URL(databaseUrl(settings));
    expect(decodeURIComponent(url.password)).toBe(settings.POSTGRES_PASSWORD);
    expect(url.hostname).toBe(settings.POSTGRES_HOST);
  });
  test('rejects example secrets without echoing values', () => {
    expect(() =>
      validate({ ...process.env, SESSION_SECRET: 'replace_with_secret' }),
    ).toThrow();
    expect(() =>
      validate({ ...process.env, POSTGRES_PASSWORD: 'replace_with_password' }),
    ).toThrow();
  });
});
