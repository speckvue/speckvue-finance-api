import { ConfigService } from '@nestjs/config';
import SettingsService from '../../src/config/settings.service';
import validate from '../../src/config/validation';
import PasswordService from '../../src/modules/auth/password.service';

describe('Argon2id authentication work', () => {
  const settings = new SettingsService(
    new ConfigService(validate(process.env)),
  );
  const service = new PasswordService(settings);

  beforeAll(async () => {
    await service.onModuleInit();
  });

  test('hashes with Argon2id and verifies without plaintext storage', async () => {
    const hash = await service.hash('test-only strong password');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await service.verify(hash, 'test-only strong password')).toBe(true);
    expect(await service.verify(hash, 'different password')).toBe(false);
    expect(await service.verify(undefined, 'test-only strong password')).toBe(
      false,
    );
  });

  test('bounds expensive concurrent hashing and releases capacity afterward', async () => {
    const bounded = new PasswordService(
      new SettingsService(
        new ConfigService(validate({ ...process.env, AUTH_CONCURRENCY: '1' })),
      ),
    );
    const first = bounded.hash('first test password');
    await expect(bounded.hash('second test password')).rejects.toThrow(
      'Authentication temporarily unavailable',
    );
    await first;
    await expect(bounded.hash('third test password')).resolves.toMatch(
      /^\$argon2id\$/,
    );
  });
});
