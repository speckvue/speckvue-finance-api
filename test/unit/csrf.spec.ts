import { ConfigService } from '@nestjs/config';
import SettingsService from '../../src/config/settings.service';
import validate from '../../src/config/validation';
import PrismaService from '../../src/database/prisma.service';
import SessionService from '../../src/modules/auth/session.service';

describe('session-bound CSRF', () => {
  const service = new SessionService(
    {} as PrismaService,
    new SettingsService(new ConfigService(validate(process.env))),
  );
  test('binds token to the current session', () => {
    const csrf = service.csrf('session-one');
    expect(service.validCsrf('session-one', csrf)).toBe(true);
    expect(service.validCsrf('session-two', csrf)).toBe(false);
  });
  test('rejects malformed tokens and never exposes raw session in hash', () => {
    expect(service.validCsrf('one', 'short')).toBe(false);
    expect(service.validCsrf('one', undefined)).toBe(false);
    expect(service.digest('one')).toMatch(/^[a-f0-9]{64}$/);
  });
});
