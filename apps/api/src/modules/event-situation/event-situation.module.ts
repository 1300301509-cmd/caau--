import { Module } from '@nestjs/common';
import { EventSituationController } from './event-situation.controller.js';
import { EventSituationService } from './event-situation.service.js';

@Module({
  controllers: [EventSituationController],
  providers: [EventSituationService],
})
export class EventSituationModule {}
