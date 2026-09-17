import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function createOpenApiDocument(app: INestApplication) {
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('CAAU API')
      .addBearerAuth()
      .addCookieAuth(
        'caau_session',
        {
          type: 'apiKey',
          in: 'cookie',
          description:
            'HttpOnly Web session cookie. Unsafe requests also require X-CSRF-Token.',
        },
        'webSession',
      )
      .setDescription(
        'Internal password/Cookie and local Bearer identity, events, private files, immutable submissions and reviews. No public registration or production deployment claim.',
      )
      .setVersion('0.5.0')
      .build(),
  );
}
