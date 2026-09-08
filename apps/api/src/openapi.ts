import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function createOpenApiDocument(app: INestApplication) {
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('CAAU API')
      .addBearerAuth()
      .setDescription(
        'Local identity, events, private material files, drafts, immutable submissions, whole-package reviews, extensions and same-organization handover. No WeChat or production identity integration.',
      )
      .setVersion('0.4.0')
      .build(),
  );
}
