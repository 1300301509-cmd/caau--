import { Global, Module, type DynamicModule } from '@nestjs/common';
import { AuthorizationService } from '../authorization/authorization.service.js';
import {
  GovernanceController,
  AiUsageController,
} from './governance.controller.js';
import { GovernanceService } from './governance.service.js';
import { UsageService } from './usage.service.js';
@Global()
@Module({})
export class GovernanceModule {
  static register(databaseUrl?: string): DynamicModule {
    return {
      module: GovernanceModule,
      controllers: [GovernanceController, AiUsageController],
      providers: [
        { provide: 'GOVERNANCE_DATABASE_URL', useValue: databaseUrl ?? '' },
        GovernanceService,
        {
          provide: UsageService,
          inject: [AuthorizationService],
          useFactory: (auth: AuthorizationService) =>
            new UsageService(auth, databaseUrl),
        },
      ],
      exports: [UsageService],
    };
  }
}
