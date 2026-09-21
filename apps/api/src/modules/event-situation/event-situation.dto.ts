import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const eventParticipantRoles = [
  'PLAYER',
  'COACH',
  'MANAGER',
  'MEDICAL',
  'OTHER',
] as const;

export class EventParticipantDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: eventParticipantRoles })
  role!: (typeof eventParticipantRoles)[number];
  @ApiProperty() jerseyNumber!: string;
  @ApiProperty() position!: string;
  @ApiProperty() contactPhone!: string;
  @ApiProperty() notes!: string;
}

export class MatchStaffMemberDto {
  @ApiPropertyOptional() sourceStaffId?: string;
  @ApiPropertyOptional() sourceStaffRevision?: number;
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() role!: string;
  @ApiProperty() organization!: string;
  @ApiProperty() contactPhone!: string;
  @ApiProperty() notes!: string;
}

export class EventTeamRosterViewDto {
  @ApiProperty() eventTeamId!: string;
  @ApiProperty() teamName!: string;
  @ApiProperty({ type: [EventParticipantDto] })
  members!: EventParticipantDto[];
  @ApiProperty() revision!: number;
  @ApiProperty() updatedAt!: string;
}

export class EventSituationMatchDto {
  @ApiProperty() id!: string;
  @ApiProperty() round!: number;
  @ApiProperty() order!: number;
  @ApiProperty() startAt!: string;
  @ApiProperty() venue!: string;
  @ApiProperty() homeLabel!: string;
  @ApiProperty() awayLabel!: string;
  @ApiProperty({ type: EventTeamRosterViewDto, nullable: true })
  homeTeam!: EventTeamRosterViewDto | null;
  @ApiProperty({ type: EventTeamRosterViewDto, nullable: true })
  awayTeam!: EventTeamRosterViewDto | null;
  @ApiProperty({ type: [MatchStaffMemberDto] })
  staff!: MatchStaffMemberDto[];
  @ApiProperty() staffRevision!: number;
}

export class EventSituationViewDto {
  @ApiProperty() exists!: boolean;
  @ApiProperty() eventId!: string;
  @ApiProperty() eventName!: string;
  @ApiProperty({ enum: ['DRAFT', 'PUBLISHED'] })
  scheduleStatus!: 'DRAFT' | 'PUBLISHED';
  @ApiProperty() scheduleRevision!: number;
  @ApiProperty({ type: [EventSituationMatchDto] })
  matches!: EventSituationMatchDto[];
  @ApiProperty() updatedAt!: string;
}

export class ReplaceEventTeamRosterDto {
  @ApiProperty() expectedRevision!: number;
  @ApiProperty({ type: [EventParticipantDto] }) members!: EventParticipantDto[];
}

export class ReplaceMatchStaffDto {
  @ApiProperty() expectedScheduleRevision!: number;
  @ApiProperty() expectedRevision!: number;
  @ApiProperty({ type: [MatchStaffMemberDto] }) staff!: MatchStaffMemberDto[];
}
