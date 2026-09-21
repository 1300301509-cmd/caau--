import { Module } from '@nestjs/common';
import {
  CompetitionEventsController,
  EventSituationController,
} from './event-situation.controller.js';
import { EventSituationService } from './event-situation.service.js';
import { EventStaffController } from './event-staff.controller.js';
import { EventStaffService } from './event-staff.service.js';

@Module({
  controllers: [
    CompetitionEventsController,
    EventSituationController,
    EventStaffController,
  ],
  providers: [EventSituationService, EventStaffService],
})
export class EventSituationModule {}
