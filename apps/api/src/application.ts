import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { readConfig } from './config.js';

export async function createApplication(config = readConfig()) {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
  });
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: config.origins,
    methods: ['GET'],
    credentials: false,
  });
  app.enableShutdownHooks();
  return app;
}
