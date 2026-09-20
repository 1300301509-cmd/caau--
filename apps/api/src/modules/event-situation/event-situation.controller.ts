import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { Permission } from '../authorization/authorization.guard.js';
import type { AuthRequest } from '../authorization/authorization.service.js';
import {
  EventSituationViewDto,
  EventTeamRosterViewDto,
  ReplaceEventTeamRosterDto,
  ReplaceMatchStaffDto,
} from './event-situation.dto.js';
import { EventSituationService } from './event-situation.service.js';

@ApiBearerAuth()
@ApiCookieAuth('webSession')
@Controller('events/:eventId')
export class EventSituationController {
  constructor(private readonly situation: EventSituationService) {}

  @Get('situation')
  @Permission('event-situation')
  @ApiOperation({
    operationId: 'getEventSituation',
    summary: 'getEventSituation',
  })
  @ApiOkResponse({ type: EventSituationViewDto })
  get(@Param('eventId') eventId: string, @Req() request: AuthRequest) {
    return this.situation.get(request.token ?? '', eventId);
  }

  @Put('teams/:eventTeamId/roster')
  @Permission('event-situation')
  @ApiOperation({
    operationId: 'replaceEventTeamRoster',
    summary: 'replaceEventTeamRoster',
  })
  @ApiOkResponse({ type: EventTeamRosterViewDto })
  replaceRoster(
    @Param('eventId') eventId: string,
    @Param('eventTeamId') eventTeamId: string,
    @Req() request: AuthRequest,
    @Body() body: ReplaceEventTeamRosterDto,
  ) {
    return this.situation.replaceRoster(
      request.token ?? '',
      eventId,
      eventTeamId,
      body,
    );
  }

  @Put('matches/:matchId/staff')
  @Permission('event-situation')
  @ApiOperation({
    operationId: 'replaceEventMatchStaff',
    summary: 'replaceEventMatchStaff',
  })
  @ApiOkResponse({ type: EventSituationViewDto })
  replaceStaff(
    @Param('eventId') eventId: string,
    @Param('matchId') matchId: string,
    @Req() request: AuthRequest,
    @Body() body: ReplaceMatchStaffDto,
  ) {
    return this.situation.replaceStaff(
      request.token ?? '',
      eventId,
      matchId,
      body,
    );
  }
}
