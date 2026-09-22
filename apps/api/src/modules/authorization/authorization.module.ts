import { Global, Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import {
  AuthenticationController,
  AuthorizationController,
  LocalTestIdentityController,
  ServerTestIdentityController,
} from './authorization.controller.js';
import {
  AuthorizationService,
  type AuthorizationConfig,
} from './authorization.service.js';
import { AuthorizationGuard } from './authorization.guard.js';
@Global()
@Module({})
export class AuthorizationModule {
  static register(config: AuthorizationConfig): DynamicModule {
    return {
      module: AuthorizationModule,
      controllers: [
        AuthenticationController,
        AuthorizationController,
        LocalTestIdentityController,
        ServerTestIdentityController,
      ],
      exports: [AuthorizationService],
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
