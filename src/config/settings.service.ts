import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Settings } from './validation';

@Injectable()
class SettingsService {
  constructor(private readonly config: ConfigService<Settings, true>) {}

  get<K extends keyof Settings>(key: K): Settings[K] {
    return this.config.get(key, { infer: true });
  }

  snapshot() {
    return {
      POSTGRES_HOST: this.get('POSTGRES_HOST'),
      POSTGRES_PORT: this.get('POSTGRES_PORT'),
      POSTGRES_DB: this.get('POSTGRES_DB'),
      POSTGRES_USER: this.get('POSTGRES_USER'),
      POSTGRES_PASSWORD: this.get('POSTGRES_PASSWORD'),
      POSTGRES_MIGRATION_USER: this.get('POSTGRES_MIGRATION_USER'),
      POSTGRES_MIGRATION_PASSWORD: this.get('POSTGRES_MIGRATION_PASSWORD'),
      DATABASE_TLS: this.get('DATABASE_TLS'),
      DATABASE_CA_FILE: this.get('DATABASE_CA_FILE'),
    };
  }
}

export default SettingsService;
