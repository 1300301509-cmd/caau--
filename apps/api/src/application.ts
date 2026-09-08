import 'reflect-metadata';
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
  const app = await NestFactory.create(
    AppModule.register(probe ?? createDatabase(config.databaseUrl)),
    {
      logger: ['error', 'warn'],
    },
  );
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: config.origins,
    methods: ['GET'],
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
