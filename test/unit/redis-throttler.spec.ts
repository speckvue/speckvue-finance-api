import RedisThrottlerStorage from '../../src/redis/redis-throttler.storage';
import type RedisService from '../../src/redis/redis.service';

test.each([
  () => Promise.reject(new Error('unavailable')),
  () => Promise.resolve(null),
])(
  'denies requests when rate limit storage is unavailable or malformed',
  async (evaluate) => {
    const redis = {
      key: (key: string) => key,
      evaluate,
    } as unknown as RedisService;
    await expect(
      new RedisThrottlerStorage(redis).increment(
        'request',
        1000,
        10,
        1000,
        'default',
      ),
    ).rejects.toMatchObject({ status: 503 });
  },
);
