import { Module, type DynamicModule } from '@nestjs/common';
import type { DatabaseProbe } from '@caau/database';
import { ReadinessController } from './readiness.controller.js';
import {
  DatabaseReadinessService,
  DATABASE_PROBE,
} from './readiness.service.js';

@Module({})
export class ReadinessModule {
  static register(probe: DatabaseProbe): DynamicModule {
    return {
      module: ReadinessModule,
      controllers: [ReadinessController],
      providers: [
        { provide: DATABASE_PROBE, useValue: probe },
        DatabaseReadinessService,
      ],
    };
  }
}
