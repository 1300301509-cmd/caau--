import { ApiProperty } from '@nestjs/swagger';

export class ScheduleConfigDto {
  @ApiProperty({ type: [String] }) teamIds!: string[];
  @ApiProperty({ type: [String] }) venues!: string[];
  @ApiProperty() startDate!: string;
  @ApiProperty() endDate!: string;
  @ApiProperty() dailyStart!: string;
  @ApiProperty() dailyEnd!: string;
  @ApiProperty() durationMinutes!: number;
  @ApiProperty() bufferMinutes!: number;
  @ApiProperty() minRestMinutes!: number;
}

export class ScheduleMatchDto {
  @ApiProperty() id!: string;
  @ApiProperty() round!: number;
  @ApiProperty() order!: number;
  @ApiProperty() homeEventTeamId!: string;
  @ApiProperty() awayEventTeamId!: string;
  @ApiProperty() homeSourceMatchId!: string;
  @ApiProperty() awaySourceMatchId!: string;
  @ApiProperty() homeLabel!: string;
  @ApiProperty() awayLabel!: string;
  @ApiProperty() startAt!: string;
  @ApiProperty() venue!: string;
}

export class ScheduleIssueDto {
  @ApiProperty() code!: string;
  @ApiProperty() message!: string;
  @ApiProperty({ type: [String] }) matchIds!: string[];
}

export class ScheduleViewDto {
  @ApiProperty() exists!: boolean;
  @ApiProperty() eventId!: string;
  @ApiProperty({ enum: ['ROUND_ROBIN', 'SINGLE_ELIMINATION'] })
  format!: 'ROUND_ROBIN' | 'SINGLE_ELIMINATION';
  @ApiProperty({ enum: ['DRAFT', 'PUBLISHED'] })
  status!: 'DRAFT' | 'PUBLISHED';
  @ApiProperty({ type: ScheduleConfigDto }) config!: ScheduleConfigDto;
  @ApiProperty({ type: [ScheduleMatchDto] }) matches!: ScheduleMatchDto[];
  @ApiProperty({ type: [ScheduleIssueDto] }) issues!: ScheduleIssueDto[];
  @ApiProperty() revision!: number;
  @ApiProperty() publishedAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class GenerateScheduleDto {
  @ApiProperty() commandId!: string;
  @ApiProperty({ enum: ['ROUND_ROBIN', 'SINGLE_ELIMINATION'] })
  format!: 'ROUND_ROBIN' | 'SINGLE_ELIMINATION';
  @ApiProperty({ type: ScheduleConfigDto }) config!: ScheduleConfigDto;
}

export class AdjustScheduleMatchDto {
  @ApiProperty() commandId!: string;
  @ApiProperty() expectedRevision!: number;
  @ApiProperty() startAt!: string;
  @ApiProperty() venue!: string;
}

export class PreviewScheduleAdjustmentDto {
  @ApiProperty() expectedRevision!: number;
  @ApiProperty() matchId!: string;
  @ApiProperty() startAt!: string;
  @ApiProperty() venue!: string;
}

export class ScheduleAdjustmentPreviewDto {
  @ApiProperty() eventId!: string;
  @ApiProperty() baselineRevision!: number;
  @ApiProperty({ type: ScheduleMatchDto }) before!: ScheduleMatchDto;
  @ApiProperty({ type: ScheduleMatchDto }) after!: ScheduleMatchDto;
  @ApiProperty({ type: [ScheduleIssueDto] }) issues!: ScheduleIssueDto[];
  @ApiProperty() expiresAt!: string;
}

export class PublishScheduleDto {
  @ApiProperty() commandId!: string;
  @ApiProperty() expectedRevision!: number;
}
