import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import AppLogger from '../common/logging/app-logger.service';
import databaseSsl from '../config/database-ssl';
import databaseUrl from '../config/database-url';
import SettingsService from '../config/settings.service';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(
    settings: SettingsService,
    private readonly logger: AppLogger,
  ) {
    super({
      adapter: new PrismaPg({
        connectionString: databaseUrl(settings.snapshot()),
        ssl: databaseSsl(settings.snapshot()),
        max: settings.get('DATABASE_POOL_MAX'),
        connectionTimeoutMillis: settings.get('DATABASE_CONNECTION_TIMEOUT_MS'),
        idleTimeoutMillis: 30000,
        statement_timeout: settings.get('DATABASE_QUERY_TIMEOUT_MS'),
        query_timeout: settings.get('DATABASE_QUERY_TIMEOUT_MS'),
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.info('Database pool initialized', {
      event: 'database_connected',
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.info('Closing database pool', {
      event: 'database_shutdown_started',
    });
    await this.$disconnect();
    this.logger.info('Database pool closed', {
      event: 'database_shutdown_completed',
    });
  }
}

export default PrismaService;
