import { Module, type ExecutionContext } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import CsrfGuard from './common/guards/csrf.guard';
import SessionGuard from './common/guards/session.guard';
import LoggingModule from './common/logging/logging.module';
import ConfigurationModule from './config/configuration.module';
import SettingsService from './config/settings.service';
import DatabaseModule from './database/database.module';
import AccountsModule from './modules/accounts/accounts.module';
import AuthModule from './modules/auth/auth.module';
import HealthModule from './modules/health/health.module';
import UsersModule from './modules/users/users.module';
import RedisThrottlerStorage from './redis/redis-throttler.storage';
import RedisModule from './redis/redis.module';

@Module({
  imports: [
    ConfigurationModule,
    DatabaseModule,
    AuthModule,
    AccountsModule,
    UsersModule,
    HealthModule,
    LoggingModule,
    RedisModule,
    ThrottlerModule.forRootAsync({
      inject: [SettingsService, RedisThrottlerStorage],
      useFactory: (s: SettingsService, storage: RedisThrottlerStorage) => ({
        storage,
        throttlers: [
          {
            name: 'default',
            ttl: s.get('THROTTLE_TTL_MS'),
            limit: (ctx: ExecutionContext) =>
              ctx.getClass().name === 'AuthController' &&
              ctx.getHandler().name !== 'csrf'
                ? s.get('AUTH_THROTTLE_LIMIT')
                : s.get('THROTTLE_LIMIT'),
          },
        ],
      }),
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
class AppModule {}

export default AppModule;
