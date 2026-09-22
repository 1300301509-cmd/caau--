import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthRequest } from '../authorization/authorization.service.js';
import { Permission } from '../authorization/authorization.guard.js';
import {
  AdjustScheduleMatchDto,
  GenerateScheduleDto,
  PreviewScheduleAdjustmentDto,
  PublishScheduleDto,
  ScheduleAdjustmentPreviewDto,
  ScheduleViewDto,
} from './scheduling.dto.js';
import { SchedulingService } from './scheduling.service.js';

@ApiTags('event-scheduling')
@ApiBearerAuth()
@ApiCookieAuth('webSession')
@ApiConflictResponse({
  description: 'Revision, command, or validation conflict',
})
@Controller('events/:eventId/schedule')
export class SchedulingController {
  constructor(private readonly scheduling: SchedulingService) {}

  @Get()
  @Permission('schedule.read')
  @ApiOperation({ operationId: 'getEventSchedule' })
  @ApiOkResponse({ type: ScheduleViewDto })
  get(@Param('eventId') eventId: string, @Req() request: AuthRequest) {
    return this.scheduling.get(request.token ?? '', eventId);
  }

  @Post('preview-adjustment')
  @HttpCode(200)
  @Permission('schedule.read')
  @ApiOperation({ operationId: 'previewEventScheduleAdjustment' })
  @ApiOkResponse({ type: ScheduleAdjustmentPreviewDto })
  preview(
    @Param('eventId') eventId: string,
    @Req() request: AuthRequest,
    @Body() body: PreviewScheduleAdjustmentDto,
  ) {
    return this.scheduling.previewAdjustment(
      request.token ?? '',
      eventId,
      body,
    );
  }

  @Post('generate')
  @Permission('schedule.draft.adjust')
  @HttpCode(200)
  @ApiOperation({ operationId: 'generateEventSchedule' })
  @ApiOkResponse({ type: ScheduleViewDto })
  generate(
    @Param('eventId') eventId: string,
    @Req() request: AuthRequest,
    @Body() body: GenerateScheduleDto,
  ) {
    return this.scheduling.generate(request.token ?? '', eventId, body);
  }

  @Put('matches/:matchId')
  @Permission('schedule.draft.adjust')
  @HttpCode(200)
  @ApiOperation({ operationId: 'adjustEventScheduleMatch' })
  @ApiOkResponse({ type: ScheduleViewDto })
  adjust(
    @Param('eventId') eventId: string,
    @Param('matchId') matchId: string,
    @Req() request: AuthRequest,
    @Body() body: AdjustScheduleMatchDto,
  ) {
    return this.scheduling.adjust(request.token ?? '', eventId, matchId, body);
  }

  @Post('publish')
  @Permission('schedule.publish')
  @HttpCode(200)
  @ApiOperation({ operationId: 'publishEventSchedule' })
  @ApiOkResponse({ type: ScheduleViewDto })
  publish(
    @Param('eventId') eventId: string,
    @Req() request: AuthRequest,
    @Body() body: PublishScheduleDto,
  ) {
    return this.scheduling.publish(request.token ?? '', eventId, body);
  }
}
