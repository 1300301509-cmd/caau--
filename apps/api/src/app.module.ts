import { Module, type DynamicModule } from '@nestjs/common';
import type { DatabaseProbe } from '@caau/database';
import { ReadinessModule } from './modules/readiness/readiness.module.js';
import { HealthModule } from './modules/health/health.module.js';

@Module({ imports: [HealthModule] })
export class AppModule {
  static register(probe: DatabaseProbe): DynamicModule {
    return { module: AppModule, imports: [ReadinessModule.register(probe)] };
  }
}
