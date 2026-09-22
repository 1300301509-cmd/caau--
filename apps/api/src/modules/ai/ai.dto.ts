import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ScheduleAdjustmentPreviewDto,
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

export class AgentMessageInputDto {
  @ApiProperty() message!: string;
  @ApiPropertyOptional() eventId?: string;
  @ApiPropertyOptional() matchId?: string;
  @ApiPropertyOptional() taskId?: string;
  @ApiPropertyOptional() newTask?: boolean;
}

export class AgentCandidateDto {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
  @ApiPropertyOptional() detail?: string;
}

export class AgentTaskParametersDto {
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
  @ApiProperty() content!: string;
  @ApiProperty() createdAt!: string;
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
}

export class AgentReplyDto {
  @ApiProperty() sessionId!: string;
  @ApiProperty({
    enum: [
      'NEED_EVENT',
      'NEED_MATCH',
      'NEED_PARAMETERS',
      'PREVIEW',
      'STALE',
      'ERROR',
    ],
  })
  status!:
    | 'NEED_EVENT'
    | 'NEED_MATCH'
    | 'NEED_PARAMETERS'
    | 'PREVIEW'
    | 'STALE'
    | 'ERROR';
  @ApiProperty() message!: string;
  @ApiProperty({ type: [AgentCandidateDto] }) candidates!: AgentCandidateDto[];
  @ApiPropertyOptional({ type: AgentTaskViewDto, nullable: true })
  task!: AgentTaskViewDto | null;
}
