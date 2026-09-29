import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ScheduleAdjustmentPreviewDto,
  ScheduleConfigDto,
  ScheduleMatchDto,
  ScheduleIssueDto,
} from '../scheduling/scheduling.dto.js';

export class AgentModelConnectionResultDto {
  @ApiProperty({
    enum: ['NOT_TESTED', 'SUCCEEDED', 'FAILED', 'NOT_APPLICABLE'],
  })
  status!: 'NOT_TESTED' | 'SUCCEEDED' | 'FAILED' | 'NOT_APPLICABLE';
  @ApiPropertyOptional({ type: String, nullable: true }) testedAt!:
    | string
    | null;
  @ApiProperty() message!: string;
}

export class AgentModelStatusDto {
  @ApiProperty({ enum: ['SIMULATED', 'QWEN'] }) mode!: 'SIMULATED' | 'QWEN';
  @ApiProperty() modelName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) baseUrlHost!:
    | string
    | null;
  @ApiProperty() credentialsConfigured!: boolean;
  @ApiProperty({ type: AgentModelConnectionResultDto })
  lastConnectionTest!: AgentModelConnectionResultDto;
}

export class AgentSessionInputDto {
  @ApiPropertyOptional() currentEventId?: string;
}

export class AgentMemoryInputDto {
  @ApiProperty({
    maxLength: 300,
    description:
      'Explicit personal preference; never a business rule or execution instruction.',
  })
  content!: string;
}

export class AgentMemoryViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() content!: string;
  @ApiProperty() revision!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class AgentMemoryDeletedDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['DELETED'] }) status!: 'DELETED';
}

export class AgentMessageInputDto {
  @ApiProperty() message!: string;
  @ApiPropertyOptional() eventId?: string;
  @ApiPropertyOptional() matchId?: string;
  @ApiPropertyOptional() teamId?: string;
  @ApiPropertyOptional() planningId?: string;
  @ApiPropertyOptional() planningRevision?: number;
  @ApiPropertyOptional() taskId?: string;
  @ApiPropertyOptional() newTask?: boolean;
}

export class AgentCandidateDto {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
  @ApiPropertyOptional() detail?: string;
}

export class AgentTaskParametersDto {
  @ApiPropertyOptional() sourceDivisionName?: string;
  @ApiPropertyOptional() sourceWeekday?: number;
  @ApiPropertyOptional() sourceOrdinal?: number;
  @ApiPropertyOptional() sourceMatchId?: string;
  @ApiPropertyOptional() targetWeekday?: number;
  @ApiPropertyOptional() targetDate?: string;
  @ApiPropertyOptional() targetHour?: number;
  @ApiPropertyOptional() targetMinute?: number;
  @ApiPropertyOptional() targetStartAt?: string;
  @ApiPropertyOptional() venue?: string;
}

export class AgentConfirmationSummaryDto {
  @ApiProperty() homeLabel!: string;
  @ApiProperty() awayLabel!: string;
  @ApiProperty() beforeStartAt!: string;
  @ApiProperty() beforeVenue!: string;
  @ApiProperty() afterStartAt!: string;
  @ApiProperty() afterVenue!: string;
}

export class AgentConfirmationTicketViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() actorId!: string;
  @ApiProperty() actorDisplayName!: string;
  @ApiProperty() eventId!: string;
  @ApiProperty() eventName!: string;
  @ApiProperty() matchId!: string;
  @ApiProperty() expectedRevision!: number;
  @ApiProperty() parameterHash!: string;
  @ApiProperty() toolVersion!: string;
  @ApiProperty() expiresAt!: string;
  @ApiProperty({ enum: ['PENDING', 'EXECUTED', 'CANCELLED'] })
  state!: 'PENDING' | 'EXECUTED' | 'CANCELLED';
  @ApiProperty({ type: AgentConfirmationSummaryDto })
  parameterSummary!: AgentConfirmationSummaryDto;
}

export class ConfirmAgentScheduleAdjustmentDto {
  @ApiProperty() eventId!: string;
  @ApiProperty() matchId!: string;
  @ApiProperty() parameterHash!: string;
}

export class AgentScheduleAdjustmentResultDto {
  @ApiProperty() ticketId!: string;
  @ApiProperty() commandId!: string;
  @ApiProperty() replayed!: boolean;
  @ApiProperty() eventId!: string;
  @ApiProperty() matchId!: string;
  @ApiProperty() revision!: number;
  @ApiProperty({ enum: ['DRAFT'] }) status!: 'DRAFT';
  @ApiProperty({ type: [ScheduleIssueDto] }) issues!: ScheduleIssueDto[];
}

export class AgentExecutionReceiptDto {
  @ApiProperty() executedAt!: string;
  @ApiProperty({ type: AgentScheduleAdjustmentResultDto })
  result!: AgentScheduleAdjustmentResultDto;
}

export class AgentCancelConfirmationDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['CANCELLED'] }) state!: 'CANCELLED';
}

export class AgentTaskViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() goal!: string;
  @ApiProperty({
    enum: [
      'LOCATE_EVENT',
      'LOCATE_MATCH',
      'WAITING_PARAMETERS',
      'PREVIEW_READY',
      'STALE',
      'FAILED',
      'EXECUTED',
      'CANCELLED',
    ],
  })
  step!:
    | 'LOCATE_EVENT'
    | 'LOCATE_MATCH'
    | 'WAITING_PARAMETERS'
    | 'PREVIEW_READY'
    | 'STALE'
    | 'FAILED'
    | 'EXECUTED'
    | 'CANCELLED';
  @ApiPropertyOptional({ type: String, nullable: true }) eventId!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) matchId!:
    | string
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) baselineRevision!:
    | number
    | null;
  @ApiProperty({ type: AgentTaskParametersDto })
  parameters!: AgentTaskParametersDto;
  @ApiProperty({ type: [String] }) pendingFields!: string[];
  @ApiPropertyOptional({ type: ScheduleAdjustmentPreviewDto, nullable: true })
  preview!: ScheduleAdjustmentPreviewDto | null;
  @ApiPropertyOptional({
    type: AgentConfirmationTicketViewDto,
    nullable: true,
  })
  confirmation!: AgentConfirmationTicketViewDto | null;
  @ApiPropertyOptional({ type: String, nullable: true }) expiresAt!:
    | string
    | null;
}

export class AgentTurnViewDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['USER', 'ASSISTANT'] }) role!: 'USER' | 'ASSISTANT';
  @ApiProperty({ maxLength: 4000 }) content!: string;
  @ApiProperty() createdAt!: string;
}

export class AgentPlanningConditionDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    enum: [
      'DATE_RANGE',
      'TEAM_WINDOW',
      'MATCHUP',
      'FORMAT',
      'DAYPART_CAPACITY',
      'DAILY_COUNT',
      'SCHEDULE_CONFIG',
    ],
  })
  kind!:
    | 'DATE_RANGE'
    | 'TEAM_WINDOW'
    | 'MATCHUP'
    | 'FORMAT'
    | 'DAYPART_CAPACITY'
    | 'DAILY_COUNT'
    | 'SCHEDULE_CONFIG';
  @ApiProperty() eventId!: string;
  @ApiProperty({ enum: ['MUST', 'PREFER'] }) priority!: 'MUST' | 'PREFER';
  @ApiProperty({ enum: ['PENDING', 'CONFIRMED'] }) confirmation!:
    | 'PENDING'
    | 'CONFIRMED';
  @ApiProperty({ type: [String] }) sourceTurnIds!: string[];
  @ApiPropertyOptional() from?: string;
  @ApiPropertyOptional() to?: string;
  @ApiPropertyOptional() durationDays?: number;
  @ApiPropertyOptional() scheduleGoal?: boolean;
  @ApiPropertyOptional({ enum: ['USER', 'EVENT_PROFILE', 'EVENT_SCHEDULE'] })
  dateSource?: 'USER' | 'EVENT_PROFILE' | 'EVENT_SCHEDULE';
  @ApiPropertyOptional({ type: [String] }) divisionIds?: string[];
  @ApiPropertyOptional({ type: [String] }) divisionLabels?: string[];
  @ApiPropertyOptional() allDivisions?: boolean;
  @ApiPropertyOptional({ enum: ['ROUND_ROBIN'] }) format?: 'ROUND_ROBIN';
  @ApiPropertyOptional({ enum: ['MORNING', 'AFTERNOON', 'EVENING'] })
  daypart?: 'MORNING' | 'AFTERNOON' | 'EVENING';
  @ApiPropertyOptional() maxMatchesPerDay?: number;
  @ApiPropertyOptional({ enum: ['EXACT', 'MAXIMUM', 'UNRESOLVED'] })
  countMode?: 'EXACT' | 'MAXIMUM' | 'UNRESOLVED';
  @ApiPropertyOptional({ enum: ['EVENT', 'VENUE'] })
  capacityScope?: 'EVENT' | 'VENUE';
  @ApiPropertyOptional() dailyStart?: string;
  @ApiPropertyOptional() dailyEnd?: string;
  @ApiPropertyOptional({ type: [String] }) venues?: string[];
  @ApiPropertyOptional() durationMinutes?: number;
  @ApiPropertyOptional() bufferMinutes?: number;
  @ApiPropertyOptional() minRestMinutes?: number;
  @ApiPropertyOptional({ enum: ['USER', 'EVENT_SCHEDULE', 'MIXED'] })
  configSource?: 'USER' | 'EVENT_SCHEDULE' | 'MIXED';
  @ApiPropertyOptional() configRevision?: number;
  @ApiPropertyOptional() participantFingerprint?: string;
  @ApiPropertyOptional() teamId?: string;
  @ApiPropertyOptional() teamLabel?: string;
  @ApiPropertyOptional() opponentId?: string;
  @ApiPropertyOptional() opponentLabel?: string;
  @ApiPropertyOptional({ type: [String] }) dates?: string[];
  @ApiPropertyOptional({ type: [Number] }) weekdays?: number[];
  @ApiPropertyOptional() startTime?: string;
  @ApiPropertyOptional() endTime?: string;
  @ApiPropertyOptional({ enum: ['AVAILABLE', 'ONLY', 'BLOCK'] }) availability?:
    | 'AVAILABLE'
    | 'ONLY'
    | 'BLOCK';
  @ApiPropertyOptional({ enum: ['PREFER', 'AVOID'] }) matchup?:
    | 'PREFER'
    | 'AVOID';
}

export class AgentPlanningSourceTurnDto {
  @ApiProperty() id!: string;
  @ApiProperty() content!: string;
}

export class AgentPlanningRequestViewDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['SCHEDULE_PLANNING'] }) type!: 'SCHEDULE_PLANNING';
  @ApiProperty() eventId!: string;
  @ApiProperty() eventName!: string;
  @ApiProperty() revision!: number;
  @ApiProperty({ enum: ['COLLECTING', 'CONFIRMED', 'STALE'] }) status!:
    | 'COLLECTING'
    | 'CONFIRMED'
    | 'STALE';
  @ApiPropertyOptional({ type: Number, nullable: true }) confirmedRevision!:
    | number
    | null;
  @ApiProperty({ type: [AgentPlanningConditionDto] })
  conditions!: AgentPlanningConditionDto[];
  @ApiProperty({ type: [AgentPlanningSourceTurnDto] })
  sourceTurns!: AgentPlanningSourceTurnDto[];
  @ApiProperty({ type: [String] }) pending!: string[];
  @ApiProperty({ type: [String] }) issues!: string[];
  @ApiProperty() summary!: string;
  @ApiProperty() updatedAt!: string;
}

export class ConfirmAgentPlanningRequestDto {
  @ApiProperty() expectedRevision!: number;
}

export class GenerateAgentScheduleCandidateDto {
  @ApiProperty() expectedRevision!: number;
  @ApiProperty() baselineRevision!: number;
  @ApiProperty({ enum: ['ROUND_ROBIN'] }) format!: 'ROUND_ROBIN';
  @ApiProperty({ enum: ['EVENT_SCHEDULE', 'EXPLICIT'] }) configSource!:
    | 'EVENT_SCHEDULE'
    | 'EXPLICIT';
  @ApiProperty({ type: ScheduleConfigDto }) config!: ScheduleConfigDto;
  @ApiProperty({ type: [String] }) fixedMatchIds!: string[];
}
export class AgentCandidatePreferenceDto {
  @ApiProperty() conditionId!: string;
  @ApiProperty({ enum: ['SATISFIED', 'UNMET', 'NOT_APPLICABLE'] }) status!:
    | 'SATISFIED'
    | 'UNMET'
    | 'NOT_APPLICABLE';
  @ApiProperty() reason!: string;
}
export class AgentCandidateChangeDto {
  @ApiProperty() matchId!: string;
  @ApiProperty() homeLabel!: string;
  @ApiProperty() awayLabel!: string;
  @ApiProperty() beforeStartAt!: string;
  @ApiProperty() beforeVenue!: string;
  @ApiProperty() afterStartAt!: string;
  @ApiProperty() afterVenue!: string;
}
export class AgentScheduleCandidateViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() planningId!: string;
  @ApiProperty() planningRevision!: number;
  @ApiProperty() eventId!: string;
  @ApiProperty() baselineRevision!: number;
  @ApiProperty({ enum: ['FOUND', 'PROVEN_CONFLICT', 'SEARCH_LIMIT', 'STALE'] })
  status!: 'FOUND' | 'PROVEN_CONFLICT' | 'SEARCH_LIMIT' | 'STALE';
  @ApiProperty() warning!: string;
  @ApiProperty({ enum: ['ROUND_ROBIN'] }) format!: 'ROUND_ROBIN';
  @ApiProperty({ type: ScheduleConfigDto }) config!: ScheduleConfigDto;
  @ApiProperty() configSource!: string;
  @ApiProperty({ type: [String] }) fixedMatchIds!: string[];
  @ApiProperty({ type: [ScheduleMatchDto] }) matches!: ScheduleMatchDto[];
  @ApiProperty({ type: [AgentCandidateChangeDto] })
  changes!: AgentCandidateChangeDto[];
  @ApiProperty({ type: [ScheduleIssueDto] }) issues!: ScheduleIssueDto[];
  @ApiProperty({ type: [AgentCandidatePreferenceDto] })
  preferences!: AgentCandidatePreferenceDto[];
  @ApiProperty() explored!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty() canSave!: boolean;
}

export class PrepareAgentCandidateSaveDto {
  @ApiProperty() expectedPlanningRevision!: number;
  @ApiProperty() expectedBaselineRevision!: number;
}
export class ConfirmAgentCandidateSaveDto {
  @ApiProperty() candidateId!: string;
  @ApiProperty() candidateHash!: string;
}
export class AgentCandidateSaveReceiptDto {
  @ApiProperty() ticketId!: string;
  @ApiProperty() commandId!: string;
  @ApiProperty() candidateId!: string;
  @ApiProperty() eventId!: string;
  @ApiProperty() revision!: number;
  @ApiProperty({ enum: ['DRAFT'] }) status!: 'DRAFT';
  @ApiProperty() matchCount!: number;
  @ApiProperty() replayed!: boolean;
}
export class AgentCandidateSaveTicketDto {
  @ApiProperty() id!: string;
  @ApiProperty() candidateId!: string;
  @ApiProperty() planningId!: string;
  @ApiProperty() eventId!: string;
  @ApiProperty() planningRevision!: number;
  @ApiProperty() baselineRevision!: number;
  @ApiProperty() candidateHash!: string;
  @ApiProperty() commandId!: string;
  @ApiProperty({ enum: ['PENDING', 'EXECUTED', 'CANCELLED'] }) state!: string;
  @ApiProperty() expiresAt!: string;
  @ApiProperty() matchCount!: number;
  @ApiProperty() canConfirm!: boolean;
  @ApiPropertyOptional({ type: AgentCandidateSaveReceiptDto, nullable: true })
  receipt!: AgentCandidateSaveReceiptDto | null;
}
export class AgentCandidateSaveCancelledDto {
  @ApiProperty() id!: string;
  @ApiProperty() eventId!: string;
  @ApiProperty({ enum: ['CANCELLED'] }) state!: 'CANCELLED';
}

export class AgentPendingQuestionDto {
  @ApiProperty() kind!: string;
  @ApiProperty() question!: string;
  @ApiProperty() planningId!: string;
  @ApiProperty() planningRevision!: number;
  @ApiProperty() expiresAt!: string;
}

export class AgentTeamProfileDto {
  @ApiProperty() name!: string;
  @ApiProperty() contactName!: string;
  @ApiProperty() contactPhone!: string;
  @ApiProperty() province!: string;
  @ApiProperty() city!: string;
  @ApiProperty() district!: string;
  @ApiProperty() address!: string;
  @ApiProperty() shortName!: string;
  @ApiProperty() clubName!: string;
  @ApiProperty() introduction!: string;
  @ApiProperty() notes!: string;
}

export class AgentTeamActionViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() eventId!: string;
  @ApiProperty() eventName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) divisionId!:
    | string
    | null;
  @ApiProperty() divisionName!: string;
  @ApiProperty() revision!: number;
  @ApiProperty({
    enum: ['COLLECTING', 'PREVIEW_READY', 'EXECUTED', 'CANCELLED'],
  })
  state!: 'COLLECTING' | 'PREVIEW_READY' | 'EXECUTED' | 'CANCELLED';
  @ApiProperty({ enum: ['REAL', 'TEST'] }) mode!: 'REAL' | 'TEST';
  @ApiProperty({ type: [AgentTeamProfileDto] })
  profiles!: AgentTeamProfileDto[];
  @ApiProperty({ type: [String] }) missing!: string[];
  @ApiProperty({ type: [String] }) teamIds!: string[];
}

export class AgentSessionViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() summary!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) currentEventId!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) currentMatchId!:
    | string
    | null;
  @ApiProperty() updatedAt!: string;
  @ApiProperty({ type: [AgentTurnViewDto] }) turns!: AgentTurnViewDto[];
  @ApiPropertyOptional({ type: AgentTaskViewDto, nullable: true })
  task!: AgentTaskViewDto | null;
  @ApiPropertyOptional({ type: AgentPlanningRequestViewDto, nullable: true })
  planningRequest!: AgentPlanningRequestViewDto | null;
  @ApiPropertyOptional({ type: AgentPendingQuestionDto, nullable: true })
  pendingQuestion!: AgentPendingQuestionDto | null;
  @ApiPropertyOptional({ type: AgentExecutionReceiptDto, nullable: true })
  lastExecution!: AgentExecutionReceiptDto | null;
  @ApiPropertyOptional({ type: AgentTeamActionViewDto, nullable: true })
  teamAction!: AgentTeamActionViewDto | null;
}

export class AgentReplyDto {
  @ApiProperty() sessionId!: string;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 300 })
  suggestedMemory?: string | null;
  @ApiProperty({
    enum: [
      'NEED_EVENT',
      'NEED_MATCH',
      'NEED_PARAMETERS',
      'PREVIEW',
      'STALE',
      'ERROR',
      'CHAT',
      'CLARIFY',
      'UNSUPPORTED',
      'QUERY',
      'PLAN',
      'NEED_TEAM',
      'EXECUTED',
      'TEAM',
    ],
  })
  status!:
    | 'NEED_EVENT'
    | 'NEED_MATCH'
    | 'NEED_PARAMETERS'
    | 'PREVIEW'
    | 'STALE'
    | 'ERROR'
    | 'CHAT'
    | 'CLARIFY'
    | 'UNSUPPORTED'
    | 'QUERY'
    | 'PLAN'
    | 'NEED_TEAM'
    | 'EXECUTED'
    | 'TEAM';
  @ApiPropertyOptional({
    type: AgentScheduleAdjustmentResultDto,
    nullable: true,
  })
  execution?: AgentScheduleAdjustmentResultDto | null;
  @ApiProperty({ maxLength: 4000 }) message!: string;
  @ApiProperty({ type: [AgentCandidateDto] }) candidates!: AgentCandidateDto[];
  @ApiPropertyOptional({ type: AgentTaskViewDto, nullable: true })
  task!: AgentTaskViewDto | null;
  @ApiPropertyOptional({ type: AgentPlanningRequestViewDto, nullable: true })
  planningRequest!: AgentPlanningRequestViewDto | null;
  @ApiPropertyOptional({ type: AgentPendingQuestionDto, nullable: true })
  pendingQuestion?: AgentPendingQuestionDto | null;
  @ApiPropertyOptional({ type: AgentTeamActionViewDto, nullable: true })
  teamAction?: AgentTeamActionViewDto | null;
}
