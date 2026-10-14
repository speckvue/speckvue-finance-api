import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import 'reflect-metadata';
import AppModule from './app.module';
import AppLogger from './common/logging/app-logger.service';
import SettingsService from './config/settings.service';
import configureApp from './configure-app';

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
    abortOnError: false,
  });
  try {
    configureApp(app);
    const s = app.get(SettingsService);
    const server = app.getHttpServer() as Server;
    server.requestTimeout = s.get('REQUEST_TIMEOUT_MS');
    server.headersTimeout = s.get('REQUEST_TIMEOUT_MS');
    server.keepAliveTimeout = 5000;
    server.maxRequestsPerSocket = 1000;
    await app.listen(s.get('APP_PORT'), s.get('APP_HOST'));
    const logger = await app.resolve(AppLogger);
    logger.info('Speckvue Finance API is ready', {
      event: 'api_started',
      port: s.get('APP_PORT'),
    });
    app.getHttpAdapter().getInstance().disable('etag');
  } catch (error) {
    await app.close();
    throw error;
  }
};

void bootstrap().catch(() => {
  console.error(
    'API startup failed. Check validated configuration and database availability.',
  );
  process.exitCode = 1;
});

export default bootstrap;
