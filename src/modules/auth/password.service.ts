import {
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import SettingsService from '../../config/settings.service';

@Injectable()
class PasswordService implements OnModuleInit {
  private active = 0;

  private dummy = '';

  constructor(private readonly settings: SettingsService) {}

  async onModuleInit(): Promise<void> {
    this.dummy = await this.hash(randomBytes(32).toString('hex'));
  }

  async hash(value: string): Promise<string> {
    return this.work(() =>
      argon2.hash(value, {
        type: argon2.argon2id,
        memoryCost: this.settings.get('ARGON_MEMORY_KIB'),
        timeCost: this.settings.get('ARGON_TIME_COST'),
        parallelism: this.settings.get('ARGON_PARALLELISM'),
      }),
    );
  }

  async verify(hash: string | undefined, value: string): Promise<boolean> {
    const matches = await this.work(() =>
      argon2.verify(hash ?? this.dummy, value),
    );
    return Boolean(hash) && matches;
  }

  private async work<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= this.settings.get('AUTH_CONCURRENCY'))
      throw new ServiceUnavailableException(
        'Authentication temporarily unavailable',
      );
    this.active++;
    try {
      return await operation();
    } finally {
      this.active--;
    }
  }
}

export default PasswordService;
