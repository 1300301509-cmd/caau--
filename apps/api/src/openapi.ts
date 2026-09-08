import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function createOpenApiDocument(app: INestApplication) {
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('CAAU API')
      .addBearerAuth()
      .setDescription(
        'Health and authorization foundation. Local test identity only; no material workflow or WeChat login.',
      )
      .setVersion('0.2.0')
      .build(),
  );
}
