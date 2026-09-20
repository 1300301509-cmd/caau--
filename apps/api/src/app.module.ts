import { Module, type DynamicModule } from '@nestjs/common';
import type { DatabaseProbe } from '@caau/database';
import { ReadinessModule } from './modules/readiness/readiness.module.js';
import { HealthModule } from './modules/health/health.module.js';

import { AuthorizationModule } from './modules/authorization/authorization.module.js';
import type { AuthorizationConfig } from './modules/authorization/authorization.service.js';

import { WorkflowModule } from './modules/workflow/workflow.module.js';
import { MaterialsModule } from './modules/materials/materials.module.js';

import { IndividualModule } from './modules/individual-materials/individual.module.js';
import { HostingModule } from './modules/event-hosting-applications/hosting.module.js';
import { TeamsModule } from './modules/teams/teams.module.js';
import { SchedulingModule } from './modules/scheduling/scheduling.module.js';
@Module({
  imports: [
    TeamsModule,
    SchedulingModule,
    HealthModule,
    MaterialsModule,
    IndividualModule,
    HostingModule,
  ],
})
export class AppModule {
  static register(
    probe: DatabaseProbe,
    config: AuthorizationConfig & { privateFileRoot?: string },
  ): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ReadinessModule.register(probe),
        AuthorizationModule.register(config),
        WorkflowModule.register(config.privateFileRoot),
      ],
    };
  }
}
