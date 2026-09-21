import { ApiProperty } from '@nestjs/swagger';

export class EventStaffProfileDto {
  @ApiProperty() name!: string;
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty() duties!: string;
  @ApiProperty() contactPhone!: string;
  @ApiProperty() organization!: string;
  @ApiProperty() notes!: string;
}
export class CreateEventStaffDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: EventStaffProfileDto }) profile!: EventStaffProfileDto;
}
export class UpdateEventStaffDto {
  @ApiProperty() expectedRevision!: number;
  @ApiProperty() active!: boolean;
  @ApiProperty({ type: EventStaffProfileDto }) profile!: EventStaffProfileDto;
}
export class EventStaffViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() eventId!: string;
  @ApiProperty({ type: EventStaffProfileDto }) profile!: EventStaffProfileDto;
  @ApiProperty() active!: boolean;
  @ApiProperty() revision!: number;
  @ApiProperty() updatedAt!: string;
}
export class EventStaffHistoryDto {
  @ApiProperty({ type: EventStaffProfileDto }) profile!: EventStaffProfileDto;
  @ApiProperty() active!: boolean;
  @ApiProperty() revision!: number;
  @ApiProperty() actorId!: string;
  @ApiProperty() actorName!: string;
  @ApiProperty() createdAt!: string;
}
