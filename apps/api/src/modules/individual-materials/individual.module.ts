import { Module } from '@nestjs/common';
import { MaterialsModule } from '../materials/materials.module.js';
import { IndividualController } from './individual.controller.js';
import { IndividualService } from './individual.service.js';
@Module({
  imports: [MaterialsModule],
  controllers: [IndividualController],
  providers: [IndividualService],
})
export class IndividualModule {}
