import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function createOpenApiDocument(app: INestApplication) {
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('CAAU API')
      .addBearerAuth()
      .setDescription(
        'Health, local identity, events and material-task preparation/publication. No material upload, submission, review or WeChat login.',
      )
      .setVersion('0.3.0')
      .build(),
  );
}
