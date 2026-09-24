import { requestMiddleware } from './modules/governance/metrics.js';
import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { readConfig } from './config.js';
import { createDatabase, type DatabaseProbe } from '@caau/database';
import { SwaggerModule } from '@nestjs/swagger';
import { createOpenApiDocument } from './openapi.js';

export async function createApplication(
  config = readConfig(),
  probe?: DatabaseProbe,
) {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register(probe ?? createDatabase(config.databaseUrl), config),
    {
      logger: ['error', 'warn'],
    },
  );
  if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy);
  app.useBodyParser('json', { limit: '512kb' });
  app.use(requestMiddleware);
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: config.origins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    credentials: true,
  });
  SwaggerModule.setup('openapi', app, createOpenApiDocument(app), {
    ui: false,
    raw: ['json'],
    jsonDocumentUrl: '/api/openapi.json',
  });
  app.enableShutdownHooks();
  return app;
}
