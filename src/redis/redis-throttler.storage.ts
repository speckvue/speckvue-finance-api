import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { createHash } from 'node:crypto';
import RedisService from './redis.service';

// A single atomic operation keeps counters and block expiry consistent across replicas.
type ThrottlerStorageRecord = Awaited<
  ReturnType<ThrottlerStorage['increment']>
>;

const incrementScript = `local blocked = redis.call('PTTL', KEYS[2])
if blocked > 0 then return {0, math.max(redis.call('PTTL', KEYS[1]), 0), 1, blocked} end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local remaining = math.max(redis.call('PTTL', KEYS[1]), 0)
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return {hits, remaining, 1, tonumber(ARGV[3])}
end
return {hits, remaining, 0, 0}`;

@Injectable()
export default class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisService) {}
  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const digest = createHash('sha256')
      .update(throttlerName + ':' + key)
      .digest('hex');
    const prefix = this.redis.key('throttle:{' + digest + '}');
    try {
      const result = await this.redis.evaluate(
        incrementScript,
        [prefix + ':hits', prefix + ':blocked'],
        [String(ttl), String(limit), String(Math.max(blockDuration, 1))],
      );
      if (
        !Array.isArray(result) ||
        result.length !== 4 ||
        !result.every((value) => typeof value === 'number')
      )
        throw new Error('Invalid throttle result');
      const [totalHits, remaining, blocked, blockRemaining] =
        result as number[];
      return {
        totalHits,
        timeToExpire: Math.ceil(remaining / 1000),
        isBlocked: blocked === 1,
        timeToBlockExpire: Math.ceil(blockRemaining / 1000),
      };
    } catch {
      throw new ServiceUnavailableException(
        'Rate limiting temporarily unavailable',
      );
    }
  }
}
