import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ScheduleAdjustmentPreviewDto } from '../scheduling/scheduling.dto.js';

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
    ],
  })
  step!:
    | 'LOCATE_EVENT'
    | 'LOCATE_MATCH'
    | 'WAITING_PARAMETERS'
    | 'PREVIEW_READY'
    | 'STALE'
    | 'FAILED';
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
