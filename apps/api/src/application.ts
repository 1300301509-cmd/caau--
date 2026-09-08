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
  app.useBodyParser('json', { limit: '512kb' });
  app.use(
    (
      _request: unknown,
      response: { setHeader(name: string, value: string): void },
      next: () => void,
    ) => {
      response.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: config.origins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
  });
  SwaggerModule.setup('openapi', app, createOpenApiDocument(app), {
    ui: false,
    raw: ['json'],
    jsonDocumentUrl: '/api/openapi.json',
  });
  app.enableShutdownHooks();
  return app;
}
