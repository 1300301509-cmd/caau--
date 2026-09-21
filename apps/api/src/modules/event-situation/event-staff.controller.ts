import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  HttpCode,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { Permission } from '../authorization/authorization.guard.js';
import type { AuthRequest } from '../authorization/authorization.service.js';
import {
  CreateEventStaffDto,
  UpdateEventStaffDto,
  EventStaffViewDto,
  EventStaffHistoryDto,
} from './event-staff.dto.js';
import { EventStaffService } from './event-staff.service.js';

@ApiBearerAuth()
@ApiCookieAuth('webSession')
@Controller('events/:eventId/staff')
export class EventStaffController {
  constructor(private readonly staff: EventStaffService) {}
  @Get()
  @Permission('event-situation')
  @ApiOperation({ operationId: 'listEventStaff' })
  @ApiOkResponse({ type: [EventStaffViewDto] })
  list(@Param('eventId') eventId: string, @Req() req: AuthRequest) {
    return this.staff.list(req.token ?? '', eventId);
  }
  @Post()
  @HttpCode(200)
  @Permission('event-situation')
  @ApiOperation({ operationId: 'createEventStaff' })
  @ApiOkResponse({ type: EventStaffViewDto })
  create(
    @Param('eventId') eventId: string,
    @Req() req: AuthRequest,
    @Body() body: CreateEventStaffDto,
  ) {
    return this.staff.create(req.token ?? '', eventId, body);
  }
  @Put(':id')
  @Permission('event-situation')
  @ApiOperation({ operationId: 'updateEventStaff' })
  @ApiOkResponse({ type: EventStaffViewDto })
  update(
    @Param('eventId') eventId: string,
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body() body: UpdateEventStaffDto,
  ) {
    return this.staff.update(req.token ?? '', eventId, id, body);
  }
  @Get(':id/history')
  @Permission('event-situation')
  @ApiOperation({ operationId: 'getEventStaffHistory' })
  @ApiOkResponse({ type: [EventStaffHistoryDto] })
  history(
    @Param('eventId') eventId: string,
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ) {
    return this.staff.history(req.token ?? '', eventId, id);
  }
}
