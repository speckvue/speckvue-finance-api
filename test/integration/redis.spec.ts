import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import AppLogger from '../../src/common/logging/app-logger.service';
import SettingsService from '../../src/config/settings.service';
import validate from '../../src/config/validation';
import RedisThrottlerStorage from '../../src/redis/redis-throttler.storage';
import RedisService from '../../src/redis/redis.service';

describe('real Redis coordination', () => {
  const settings = new SettingsService(
    new ConfigService(validate(process.env)),
  );
  const logger = { info: jest.fn(), error: jest.fn() } as unknown as AppLogger;
  const first = new RedisService(settings, logger);
  const second = new RedisService(settings, logger);
  beforeAll(async () => {
    await Promise.all([first.onModuleInit(), second.onModuleInit()]);
  });
  afterAll(async () => {
    await Promise.all([first.onModuleDestroy(), second.onModuleDestroy()]);
  });
  test('stores cache values across clients with TTL and deletion', async () => {
    const key = randomUUID();
    await first.set(key, 'public-value', 1);
    expect(await second.get(key)).toBe('public-value');
    await second.delete(key);
    expect(await first.get(key)).toBeNull();
    await first.set(key, 'expires', 1);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(await second.get(key)).toBeNull();
  });
  test('enforces one atomic limit across concurrent clients', async () => {
    const storages = [
      new RedisThrottlerStorage(first),
      new RedisThrottlerStorage(second),
    ];
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, index) =>
        storages[index % 2].increment(key, 1000, 7, 1000, 'test'),
      ),
    );
    expect(results.filter((result) => !result.isBlocked)).toHaveLength(7);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(
      (await storages[1].increment(key, 1000, 7, 1000, 'test')).isBlocked,
    ).toBe(false);
  });
  test('keeps idle connections open beyond the command deadline', async () => {
    await new Promise((resolve) =>
      setTimeout(resolve, settings.get('REDIS_COMMAND_TIMEOUT_MS') + 200),
    );
    await Promise.all([first.ping(), second.ping()]);
    expect(logger.error).not.toHaveBeenCalled();
  });
  test('fails closed when Redis cannot enforce a limit', async () => {
    const unavailable = {
      key: (key: string) => key,
      evaluate: () => Promise.reject(new Error('unavailable')),
    } as unknown as RedisService;
    await expect(
      new RedisThrottlerStorage(unavailable).increment(
        'key',
        1000,
        2,
        1000,
        'test',
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
});
