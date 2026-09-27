import { UsageService } from '../governance/usage.service.js';
import { Module, type DynamicModule } from '@nestjs/common';
import { AiController } from './ai.controller.js';
import { AgentSkillController } from './skill.controller.js';
import { AgentSkillService } from './skill.service.js';
import { AiService } from './ai.service.js';
import { PlanningService } from './planning.service.js';
import { CandidateService } from './candidate.service.js';
import { AgentMemoryService } from './memory.service.js';
import { createAgentModel, type AgentModelAdapter } from './model-adapter.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { SchedulingService } from '../scheduling/scheduling.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';

@Module({})
export class AiModule {
  static register(
    databaseUrl?: string,
    configuredModel?: AgentModelAdapter,
  ): DynamicModule {
    return {
      module: AiModule,
      imports: [SchedulingModule],
      controllers: [AiController, AgentSkillController],
      providers: [
        PlanningService,
        CandidateService,
        AgentMemoryService,
        AgentSkillService,
        {
          provide: 'AGENT_MODEL',
          inject: [UsageService],
          useFactory: (usage: UsageService) =>
            usage.wrap(configuredModel ?? createAgentModel()),
        },
        {
          provide: AiService,
          inject: [
            AuthorizationService,
            'AGENT_MODEL',
            SchedulingService,
            PlanningService,
            CandidateService,
            AgentSkillService,
          ],
          useFactory: (
            auth: AuthorizationService,
            model: ReturnType<typeof createAgentModel>,
            scheduling: SchedulingService,
            planning: PlanningService,
            candidates: CandidateService,
            skills: AgentSkillService,
          ) =>
            new AiService(
              auth,
              model,
              scheduling,
              databaseUrl,
              planning,
              candidates,
              skills,
            ),
        },
      ],
    };
  }
}
