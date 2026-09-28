import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
export class TeamProfileDto {
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
export class TeamOrganizationDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}
export class EventDivisionViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() eventId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() active!: boolean;
  @ApiProperty() revision!: number;
  @ApiProperty() updatedAt!: string;
}
export class CreateEventDivisionDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}
export class UpdateEventDivisionDto {
  @ApiProperty() expectedRevision!: number;
  @ApiProperty() name!: string;
  @ApiProperty() active!: boolean;
}
export class TeamViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() teamId!: string;
  @ApiProperty() organizationId!: string;
  @ApiProperty() eventId!: string;
  @ApiProperty({ type: String, nullable: true }) divisionId!: string | null;
  @ApiProperty({ type: TeamProfileDto }) profile!: TeamProfileDto;
  @ApiProperty() active!: boolean;
  @ApiProperty() revision!: number;
  @ApiProperty() sourceTeamRevision!: number;
  @ApiProperty() bound!: boolean;
  @ApiProperty() canEdit!: boolean;
  @ApiProperty() updatedAt!: string;
}
export class CreateTeamDto {
  @ApiProperty() id!: string;
  @ApiProperty() organizationId!: string;
  @ApiPropertyOptional() eventId?: string;
  @ApiPropertyOptional({ description: 'Required when eventId is supplied' })
  divisionId?: string;
  @ApiProperty({ type: TeamProfileDto }) profile!: TeamProfileDto;
}
export class UpdateTeamDto {
  @ApiProperty() expectedRevision!: number;
  @ApiProperty() active!: boolean;
  @ApiProperty({ type: TeamProfileDto }) profile!: TeamProfileDto;
}
export class AddEventTeamDto {
  @ApiProperty() teamId!: string;
  @ApiProperty() divisionId!: string;
}
export class UpdateEventTeamDto extends UpdateTeamDto {
  @ApiPropertyOptional({
    description:
      'Assign or change this event participation to an active division',
  })
  divisionId?: string;
}
