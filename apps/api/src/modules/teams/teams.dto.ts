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
export class TeamViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() teamId!: string;
  @ApiProperty() organizationId!: string;
  @ApiProperty() eventId!: string;
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
  @ApiProperty({ type: TeamProfileDto }) profile!: TeamProfileDto;
}
export class UpdateTeamDto {
  @ApiProperty() expectedRevision!: number;
  @ApiProperty() active!: boolean;
  @ApiProperty({ type: TeamProfileDto }) profile!: TeamProfileDto;
}
export class AddEventTeamDto {
  @ApiProperty() teamId!: string;
}
