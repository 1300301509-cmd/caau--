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
import { AgentMemoryService } from './memory.service.js';
import { CandidateService } from './candidate.service.js';
import {
  AgentCancelConfirmationDto,
  AgentMessageInputDto,
  AgentPlanningRequestViewDto,
  AgentScheduleCandidateViewDto,
  PrepareAgentCandidateSaveDto,
  ConfirmAgentCandidateSaveDto,
  AgentCandidateSaveTicketDto,
  AgentCandidateSaveReceiptDto,
  AgentCandidateSaveCancelledDto,
  GenerateAgentScheduleCandidateDto,
  ConfirmAgentPlanningRequestDto,
  AgentModelStatusDto,
  AgentReplyDto,
  AgentScheduleAdjustmentResultDto,
  ConfirmAgentScheduleAdjustmentDto,
  AgentSessionInputDto,
  AgentSessionViewDto,
  AgentMemoryInputDto,
  AgentMemoryViewDto,
  AgentMemoryDeletedDto,
} from './ai.dto.js';

@ApiTags('agent')
@ApiBearerAuth()
@ApiCookieAuth('webSession')
@Controller('agent')
export class AiController {
  constructor(
    private readonly service: AiService,
    private readonly candidates: CandidateService,
    private readonly memories: AgentMemoryService,
  ) {}

  @Get('memories')
  @Permission('agent.session')
  @ApiOperation({ operationId: 'listAgentMemories' })
  @ApiOkResponse({ type: [AgentMemoryViewDto] })
  listMemories(@Req() request: AuthRequest) {
    return this.memories.list(request.token ?? '');
  }

  @Post('memories')
  @HttpCode(200)
  @Permission('agent.session')
  @ApiOperation({ operationId: 'createAgentMemory' })
  @ApiOkResponse({ type: AgentMemoryViewDto })
  createMemory(@Req() request: AuthRequest, @Body() body: AgentMemoryInputDto) {
    return this.memories.create(request.token ?? '', body);
  }

  @Post('memories/:memoryId/delete')
  @HttpCode(200)
  @Permission('agent.session')
  @ApiOperation({ operationId: 'deleteAgentMemory' })
  @ApiOkResponse({ type: AgentMemoryDeletedDto })
  deleteMemory(
    @Req() request: AuthRequest,
    @Param('memoryId') memoryId: string,
  ) {
    return this.memories.remove(request.token ?? '', memoryId);
  }

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
  @ApiOkResponse({ type: AgentCancelConfirmationDto })
  cancelScheduleAdjustment(
    @Req() request: AuthRequest,
    @Param('ticketId') ticketId: string,
  ) {
    return this.service.cancelScheduleAdjustment(request.token ?? '', ticketId);
  }

  @Post('planning-requests/:planningId/confirm')
  @HttpCode(200)
  @Permission('agent.planning.confirm')
  @ApiOperation({
    operationId: 'confirmAgentPlanningRequest',
    description:
      'Confirm a requirements revision only; does not generate schedules or issue execution tickets.',
  })
  @ApiOkResponse({ type: AgentPlanningRequestViewDto })
  confirmPlanning(
    @Req() request: AuthRequest,
    @Param('planningId') planningId: string,
    @Body() body: ConfirmAgentPlanningRequestDto,
  ) {
    return this.service.confirmPlanningRequest(
      request.token ?? '',
      planningId,
      body,
    );
  }

  @Post('planning-requests/:planningId/candidates')
  @HttpCode(200)
  @Permission('agent.candidate.preview')
  @ApiOperation({
    operationId: 'previewAgentScheduleCandidate',
    description:
      'Calculate and persist a non-executable whole-schedule candidate only; never saves a formal schedule.',
  })
  @ApiOkResponse({ type: AgentScheduleCandidateViewDto })
  previewCandidate(
    @Req() request: AuthRequest,
    @Param('planningId') planningId: string,
    @Body() body: GenerateAgentScheduleCandidateDto,
  ) {
    return this.candidates.generate(request.token ?? '', planningId, body);
  }

  @Get('planning-requests/:planningId/candidates/latest')
  @Permission('agent.candidate.read')
  @ApiOperation({ operationId: 'getLatestAgentScheduleCandidate' })
  @ApiOkResponse({
    type: AgentScheduleCandidateViewDto,
    description:
      'Most recent candidate; 404 when absent. Re-authorized and freshness-checked.',
  })
  latestCandidate(
    @Req() request: AuthRequest,
    @Param('planningId') planningId: string,
  ) {
    return this.candidates.latest(request.token ?? '', planningId);
  }

  @Get('planning-requests/:planningId/candidates/:candidateId')
  @Permission('agent.candidate.read')
  @ApiOperation({ operationId: 'getAgentScheduleCandidate' })
  @ApiOkResponse({ type: AgentScheduleCandidateViewDto })
  candidate(
    @Req() request: AuthRequest,
    @Param('planningId') planningId: string,
    @Param('candidateId') candidateId: string,
  ) {
    return this.candidates.get(request.token ?? '', planningId, candidateId);
  }

  @Post('planning-requests/:planningId/candidates/:candidateId/save-ticket')
  @HttpCode(200)
  @Permission('schedule.draft.generate')
  @ApiOperation({
    operationId: 'prepareAgentCandidateDraftSave',
    description:
      'Create a bound, expiring ticket for one fresh candidate; no schedule write.',
  })
  @ApiOkResponse({ type: AgentCandidateSaveTicketDto })
  prepareCandidateSave(
    @Req() request: AuthRequest,
    @Param('planningId') planningId: string,
    @Param('candidateId') candidateId: string,
    @Body() body: PrepareAgentCandidateSaveDto,
  ) {
    return this.candidates.prepareSave(
      request.token ?? '',
      planningId,
      candidateId,
      body,
    );
  }

  @Get(
    'planning-requests/:planningId/candidates/:candidateId/save-ticket/latest',
  )
  @Permission('schedule.draft.generate')
  @ApiOperation({ operationId: 'getLatestAgentCandidateDraftSaveTicket' })
  @ApiOkResponse({ type: AgentCandidateSaveTicketDto })
  latestCandidateSaveTicket(
    @Req() request: AuthRequest,
    @Param('planningId') planningId: string,
    @Param('candidateId') candidateId: string,
  ) {
    return this.candidates.latestSaveTicket(
      request.token ?? '',
      planningId,
      candidateId,
    );
  }

  @Post('candidate-save-tickets/:ticketId/confirm')
  @HttpCode(200)
  @Permission('schedule.draft.generate')
  @ApiOperation({
    operationId: 'confirmAgentCandidateDraftSave',
    description:
      'Re-authorize and atomically save one DRAFT schedule version and immutable receipt.',
  })
  @ApiOkResponse({ type: AgentCandidateSaveReceiptDto })
  confirmCandidateSave(
    @Req() request: AuthRequest,
    @Param('ticketId') ticketId: string,
    @Body() body: ConfirmAgentCandidateSaveDto,
  ) {
    return this.candidates.confirmSave(request.token ?? '', ticketId, body);
  }

  @Post('candidate-save-tickets/:ticketId/cancel')
  @HttpCode(200)
  @Permission('schedule.draft.generate')
  @ApiOperation({ operationId: 'cancelAgentCandidateDraftSave' })
  @ApiOkResponse({ type: AgentCandidateSaveCancelledDto })
  cancelCandidateSave(
    @Req() request: AuthRequest,
    @Param('ticketId') ticketId: string,
  ) {
    return this.candidates.cancelSave(request.token ?? '', ticketId);
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
  @ApiOperation({
    operationId: 'sendAgentMessage',
    description:
      'Route authorized chat, read-only queries, requirement collection and single-match scheduling; requirement confirmation cannot write a schedule.',
  })
  @ApiOkResponse({ type: AgentReplyDto })
  message(
    @Req() request: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Body() body: AgentMessageInputDto,
  ) {
    return this.service.message(request.token ?? '', sessionId, body);
  }
}
