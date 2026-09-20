import { Module } from '@nestjs/common';
import { EventSuppliesController } from './event-supplies.controller.js';
import { EventSuppliesService } from './event-supplies.service.js';

@Module({
  controllers: [EventSuppliesController],
  providers: [EventSuppliesService],
})
export class EventSuppliesModule {}
