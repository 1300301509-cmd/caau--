import { Module, type DynamicModule } from '@nestjs/common';
import type { DatabaseProbe } from '@caau/database';
import { ReadinessModule } from './modules/readiness/readiness.module.js';
import { HealthModule } from './modules/health/health.module.js';

import { AuthorizationModule } from './modules/authorization/authorization.module.js';
import type { AuthorizationConfig } from './modules/authorization/authorization.service.js';

@Module({ imports: [HealthModule] })
export class AppModule {
  static register(
    probe: DatabaseProbe,
    config: AuthorizationConfig,
  ): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ReadinessModule.register(probe),
        AuthorizationModule.register(config),
      ],
    };
  }
}
