import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import 'reflect-metadata';
import AppModule from '../src/app.module';
import SettingsService from '../src/config/settings.service';
import configureApp from '../src/configure-app';

const generate = async (): Promise<void> => {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false,
    bodyParser: false,
  });
  configureApp(app);
  const s = app.get(SettingsService);
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle(s.get('APP_NAME'))
      .setVersion(s.get('API_VERSION'))
      .addCookieAuth(
        s.get('SESSION_COOKIE_NAME'),
        { type: 'apiKey', in: 'cookie' },
        'session',
      )
      .build(),
  );
  writeFileSync('openapi.json', JSON.stringify(document, null, 2));
  await app.close();
};

void generate();

export default generate;
