import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function createOpenApiDocument(app: INestApplication) {
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('CAAU engineering API')
      .setDescription(
        'Liveness and database connectivity only. No approved business models.',
      )
      .setVersion('0.1.0')
      .build(),
  );
}
