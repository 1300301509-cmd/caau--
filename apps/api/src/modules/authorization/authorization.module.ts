import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthorizationController } from './authorization.controller.js';
import {
  AuthorizationService,
  type AuthorizationConfig,
} from './authorization.service.js';
import { AuthorizationGuard } from './authorization.guard.js';
@Module({})
export class AuthorizationModule {
  static register(config: AuthorizationConfig): DynamicModule {
    return {
      module: AuthorizationModule,
      controllers: [AuthorizationController],
      providers: [
        {
          provide: AuthorizationService,
          useFactory: () => new AuthorizationService(config),
        },
        { provide: APP_GUARD, useClass: AuthorizationGuard },
      ],
    };
  }
}
