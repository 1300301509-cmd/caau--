import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthRequest } from '../authorization/authorization.service.js';
import { Permission } from '../authorization/authorization.guard.js';
import { AiService } from './ai.service.js';
import {
  AgentConfirmationTicketViewDto,
  AgentMessageInputDto,
  AgentModelStatusDto,
  AgentReplyDto,
  AgentScheduleAdjustmentResultDto,
  ConfirmAgentScheduleAdjustmentDto,
  AgentSessionInputDto,
  AgentSessionViewDto,
} from './ai.dto.js';

@ApiTags('agent')
@ApiBearerAuth()
@ApiCookieAuth('webSession')
@Controller('agent')
export class AiController {
  constructor(private readonly service: AiService) {}

  @Get('model-status')
  @Permission('agent.model.status')
  @ApiOperation({ operationId: 'getAgentModelStatus' })
  @ApiOkResponse({ type: AgentModelStatusDto })
  modelStatus(@Req() request: AuthRequest) {
    return this.service.getModelStatus(request.token ?? '');
  }

  @Post('model-status/test')
  @HttpCode(200)
  @Permission('agent.model.test')
  @ApiOperation({ operationId: 'testAgentModelConnection' })
  @ApiOkResponse({ type: AgentModelStatusDto })
  testModel(@Req() request: AuthRequest) {
    return this.service.testModelConnection(request.token ?? '');
  }

  @Post('confirmation-tickets/:ticketId/confirm')
  @HttpCode(200)
  @Permission('agent.schedule.confirm')
  @ApiOperation({ operationId: 'confirmAgentScheduleAdjustment' })
  @ApiOkResponse({ type: AgentScheduleAdjustmentResultDto })
  confirmScheduleAdjustment(
    @Req() request: AuthRequest,
    @Param('ticketId') ticketId: string,
    @Body() body: ConfirmAgentScheduleAdjustmentDto,
  ) {
    return this.service.confirmScheduleAdjustment(
      request.token ?? '',
      ticketId,
      body,
    );
  }

  @Post('confirmation-tickets/:ticketId/cancel')
  @HttpCode(200)
  @Permission('agent.schedule.cancel')
  @ApiOperation({ operationId: 'cancelAgentScheduleAdjustment' })
  @ApiOkResponse({ type: AgentConfirmationTicketViewDto })
  cancelScheduleAdjustment(
    @Req() request: AuthRequest,
    @Param('ticketId') ticketId: string,
  ) {
    return this.service.cancelScheduleAdjustment(request.token ?? '', ticketId);
  }

  @Post('sessions')
  @HttpCode(200)
  @Permission('agent.session')
  @ApiOperation({ operationId: 'createAgentSession' })
  @ApiOkResponse({ type: AgentSessionViewDto })
  create(@Req() request: AuthRequest, @Body() body: AgentSessionInputDto) {
    return this.service.createSession(request.token ?? '', body);
  }

  @Get('sessions')
  @Permission('agent.session')
  @ApiOperation({ operationId: 'listAgentSessions' })
  @ApiOkResponse({ type: [AgentSessionViewDto] })
  list(@Req() request: AuthRequest) {
    return this.service.listSessions(request.token ?? '');
  }

  @Get('sessions/:sessionId')
  @Permission('agent.session')
  @ApiOperation({ operationId: 'getAgentSession' })
  @ApiOkResponse({ type: AgentSessionViewDto })
  get(@Req() request: AuthRequest, @Param('sessionId') sessionId: string) {
    return this.service.getSession(request.token ?? '', sessionId);
  }

  @Post('sessions/:sessionId/messages')
  @HttpCode(200)
  @Permission('agent.message')
  @ApiOperation({ operationId: 'sendAgentMessage' })
  @ApiOkResponse({ type: AgentReplyDto })
  message(
    @Req() request: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Body() body: AgentMessageInputDto,
  ) {
    return this.service.message(request.token ?? '', sessionId, body);
  }
}
