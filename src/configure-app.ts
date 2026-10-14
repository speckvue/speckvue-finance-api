import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Response } from 'express';
import express from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import ProblemFilter from './common/filters/problem.filter';
import AppLogger from './common/logging/app-logger.service';
import type { ApiRequest } from './common/types/http';
import SettingsService from './config/settings.service';

const configureApp = (app: NestExpressApplication): void => {
  const s = app.get(SettingsService);
  app.useLogger(app.get(AppLogger));
  app.set(
    'trust proxy',
    s.get('TRUST_PROXY_CIDRS') ? s.get('TRUST_PROXY_CIDRS').split(',') : false,
  );
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cookieParser());
  app.use((req: ApiRequest, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    req.id = randomUUID();
    const started = performance.now();
    res.once('finish', () =>
      app.get(AppLogger).info('Request completed', {
        event: 'request_completed',
        requestId: req.id,
        method: req.method,
        status: res.statusCode,
        durationMs: Math.round(performance.now() - started),
      }),
    );
    res.setHeader('X-Request-ID', req.id);
    next();
  });
  app.use(express.json({ limit: s.get('BODY_LIMIT'), strict: true }));
  app.enableCors({
    origin: s
      .get('CORS_ORIGINS')
      .split(',')
      .map((v) => v.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Idempotency-Key'],
    exposedHeaders: ['X-Request-ID'],
  });
  app.setGlobalPrefix(s.get('API_PREFIX'));
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: s.get('API_VERSION'),
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
    }),
  );
  app.useGlobalFilters(new ProblemFilter(app.get(AppLogger)));
  app.enableShutdownHooks(undefined, { useProcessExit: true });
  if (s.get('SWAGGER_ENABLED')) {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle(s.get('APP_NAME'))
        .setDescription(
          'Secure Speckvue Finance backend foundation. Mutations require an allowed Origin and authenticated writes require X-CSRF-Token.',
        )
        .setVersion(s.get('API_VERSION'))
        .addCookieAuth(
          s.get('SESSION_COOKIE_NAME'),
          { type: 'apiKey', in: 'cookie' },
          'session',
        )
        .build(),
    );
    SwaggerModule.setup('docs', app, doc, { jsonDocumentUrl: 'openapi.json' });
  }
};

export default configureApp;
