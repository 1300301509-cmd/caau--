import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ScheduleAdjustmentPreviewDto } from '../scheduling/scheduling.dto.js';

export class AgentSessionInputDto {
  @ApiPropertyOptional() currentEventId?: string;
}

export class AgentMessageInputDto {
  @ApiProperty() message!: string;
  @ApiPropertyOptional() eventId?: string;
  @ApiPropertyOptional() matchId?: string;
}

export class AgentCandidateDto {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
  @ApiPropertyOptional() detail?: string;
}

export class AgentTaskViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() goal!: string;
  @ApiProperty({
    enum: ['LOCATE_EVENT', 'LOCATE_MATCH', 'PREVIEW_READY', 'STALE', 'FAILED'],
  })
  step!: 'LOCATE_EVENT' | 'LOCATE_MATCH' | 'PREVIEW_READY' | 'STALE' | 'FAILED';
  @ApiPropertyOptional({ type: String, nullable: true }) eventId!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) matchId!:
    | string
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) baselineRevision!:
    | number
    | null;
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
    enum: ['NEED_EVENT', 'NEED_MATCH', 'PREVIEW', 'STALE', 'ERROR'],
  })
  status!: 'NEED_EVENT' | 'NEED_MATCH' | 'PREVIEW' | 'STALE' | 'ERROR';
  @ApiProperty() message!: string;
  @ApiProperty({ type: [AgentCandidateDto] }) candidates!: AgentCandidateDto[];
  @ApiPropertyOptional({ type: AgentTaskViewDto, nullable: true })
  task!: AgentTaskViewDto | null;
}
