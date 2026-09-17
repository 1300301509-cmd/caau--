import { Module } from '@nestjs/common';
import { HostingController } from './hosting.controller.js';
import { HostingService } from './hosting.service.js';

@Module({
  controllers: [HostingController],
  providers: [HostingService],
})
export class HostingModule {}
