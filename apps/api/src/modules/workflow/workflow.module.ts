import { Module, type DynamicModule } from '@nestjs/common';
import { WorkflowController } from './workflow.controller.js';
import { WorkflowService } from './workflow.service.js';
import { PrivateStore } from './private-store.js';
@Module({})
export class WorkflowModule {
  static register(root?: string): DynamicModule {
    return {
      module: WorkflowModule,
      controllers: [WorkflowController],
      providers: [
        WorkflowService,
        { provide: PrivateStore, useFactory: () => new PrivateStore(root) },
      ],
    };
  }
}
