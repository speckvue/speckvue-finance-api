import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { createClient } from 'redis';
import AppLogger from '../common/logging/app-logger.service';
import SettingsService from '../config/settings.service';

@Injectable()
export default class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly client;
  private connecting?: Promise<void>;
  private stopping = false;
  constructor(
    private readonly settings: SettingsService,
    private readonly logger: AppLogger,
  ) {
    this.client = createClient({
      socket: {
        host: settings.get('REDIS_HOST'),
        port: settings.get('REDIS_PORT'),
        connectTimeout: settings.get('REDIS_CONNECT_TIMEOUT_MS'),
        ...(settings.get('REDIS_TLS')
          ? { tls: true as const, rejectUnauthorized: true }
          : {}),
        reconnectStrategy: (retries) =>
          retries > 3
            ? new Error('Redis reconnect limit reached')
            : Math.min(100 * 2 ** retries, 1000),
      },
      password: settings.get('REDIS_PASSWORD'),
      database: settings.get('REDIS_DATABASE'),
      disableOfflineQueue: true,
    });
    this.client.on('error', () =>
      this.logger.error('Redis connection unavailable', {
        event: 'redis_error',
      }),
    );
  }
  async onModuleInit(): Promise<void> {
    await this.connect();
  }
  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.client.isOpen) await this.client.close();
    this.logger.info('Redis connection closed', {
      event: 'redis_shutdown_completed',
    });
  }
  private async connect(): Promise<void> {
    if (this.stopping) throw new Error('Redis is shutting down');
    if (!this.client.isOpen) {
      this.connecting ??= this.client
        .connect()
        .then(() => {
          this.logger.info('Redis connected', { event: 'redis_connected' });
        })
        .finally(() => {
          this.connecting = undefined;
        });
    }
    await this.connecting;
  }
  private async command() {
    await this.connect();
    return this.client.withAbortSignal(
      AbortSignal.timeout(this.settings.get('REDIS_COMMAND_TIMEOUT_MS')),
    );
  }
  key(key: string): string {
    return this.settings.get('REDIS_KEY_PREFIX') + ':' + key;
  }
  async ping(): Promise<void> {
    if ((await (await this.command()).ping()) !== 'PONG')
      throw new Error('Redis unavailable');
  }
  async evaluate(script: string, keys: string[], args: string[]) {
    return (await this.command()).eval(script, { keys, arguments: args });
  }
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1)
      throw new Error('Cache TTL must be positive');
    await (
      await this.command()
    ).set(this.key('cache:' + key), value, {
      EX: ttlSeconds,
    });
  }
  async get(key: string): Promise<string | null> {
    return (await this.command()).get(this.key('cache:' + key));
  }
  async delete(key: string): Promise<void> {
    await (await this.command()).del(this.key('cache:' + key));
  }
}
