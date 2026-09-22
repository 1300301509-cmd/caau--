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
  AgentMessageInputDto,
  AgentReplyDto,
  AgentSessionInputDto,
  AgentSessionViewDto,
} from './ai.dto.js';

@ApiTags('agent')
@ApiBearerAuth()
@ApiCookieAuth('webSession')
@Controller('agent/sessions')
export class AiController {
  constructor(private readonly service: AiService) {}

  @Post()
  @HttpCode(200)
  @Permission('agent.session')
  @ApiOperation({ operationId: 'createAgentSession' })
  @ApiOkResponse({ type: AgentSessionViewDto })
  create(@Req() request: AuthRequest, @Body() body: AgentSessionInputDto) {
    return this.service.createSession(request.token ?? '', body);
  }

  @Get()
  @Permission('agent.session')
  @ApiOperation({ operationId: 'listAgentSessions' })
  @ApiOkResponse({ type: [AgentSessionViewDto] })
  list(@Req() request: AuthRequest) {
    return this.service.listSessions(request.token ?? '');
  }

  @Get(':sessionId')
  @Permission('agent.session')
  @ApiOperation({ operationId: 'getAgentSession' })
  @ApiOkResponse({ type: AgentSessionViewDto })
  get(@Req() request: AuthRequest, @Param('sessionId') sessionId: string) {
    return this.service.getSession(request.token ?? '', sessionId);
  }

  @Post(':sessionId/messages')
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
