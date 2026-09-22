import { Module, type DynamicModule } from '@nestjs/common';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { createAgentModel } from './model-adapter.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { AuthorizationService } from '../authorization/authorization.service.js';

@Module({})
export class AiModule {
  static register(databaseUrl?: string): DynamicModule {
    return {
      module: AiModule,
      imports: [SchedulingModule],
      controllers: [AiController],
      providers: [
        { provide: 'AGENT_MODEL', useFactory: () => createAgentModel() },
        {
          provide: AiService,
          inject: [AuthorizationService, 'AGENT_MODEL'],
          useFactory: (
            auth: AuthorizationService,
            model: ReturnType<typeof createAgentModel>,
          ) => new AiService(auth, model, databaseUrl),
        },
      ],
    };
  }
}
