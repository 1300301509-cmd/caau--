import { ApiProperty } from '@nestjs/swagger';
import { IdDto } from '../authorization/authorization.dto.js';
export class EventInputDto {
  @ApiProperty({ maxLength: 120 }) name!: string;
  @ApiProperty({ maxLength: 2000 }) description!: string;
}
export class EventViewDto extends EventInputDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}
export class AssignmentDto {
  @ApiProperty({ format: 'uuid' }) organizationId!: string;
  @ApiProperty({ format: 'uuid' }) handlerMemberId!: string;
  @ApiProperty({ format: 'uuid' }) reviewerMemberId!: string;
}
export class CreateTaskDto extends AssignmentDto {
  @ApiProperty({ format: 'uuid' }) eventId!: string;
  @ApiProperty({ maxLength: 160 }) title!: string;
}
export class RevisionDto {
  @ApiProperty({ minimum: 1, type: 'integer' }) expectedRevision!: number;
}
export class UpdateAssignmentDto extends AssignmentDto {
  @ApiProperty({ minimum: 1, type: 'integer' }) expectedRevision!: number;
}
export class MaterialRequirementDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ maxLength: 160 }) title!: string;
  @ApiProperty() required!: boolean;
  @ApiProperty({ maxLength: 2000 }) instructions!: string;
  @ApiProperty({ maxLength: 120 }) templateVersion!: string;
  @ApiProperty({ type: [String], minItems: 1 }) formats!: string[];
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 2147483647 })
  maxBytes!: number;
  @ApiProperty({ format: 'date-time' }) deadline!: string;
  @ApiProperty({ maxLength: 2000 }) acceptanceStandard!: string;
}
export class RequirementsDto {
  @ApiProperty({ format: 'date-time' }) deadline!: string;
  @ApiProperty({ type: [MaterialRequirementDto], minItems: 1, maxItems: 50 })
  materials!: MaterialRequirementDto[];
}
export class ConfigureTaskDto extends RevisionDto {
  @ApiProperty({ type: RequirementsDto }) requirements!: RequirementsDto;
}
export class TaskViewDto extends CreateTaskDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['DRAFT', 'PUBLISHED'] }) state!: 'DRAFT' | 'PUBLISHED';
  @ApiProperty({ type: 'integer' }) revision!: number;
  @ApiProperty({ type: RequirementsDto, nullable: true })
  requirements!: RequirementsDto | null;
  @ApiProperty({ type: 'integer', nullable: true }) requirementVersion!:
    | number
    | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  publishedAt!: string | null;
}
export class PersonDto extends IdDto {
  @ApiProperty() displayName!: string;
}
export class OrganizationChoiceDto extends IdDto {
  @ApiProperty() name!: string;
}
export class MemberChoiceDto extends IdDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ format: 'uuid' }) organizationId!: string;
  @ApiProperty({
    enum: ['EVENT_MANAGER', 'ORGANIZER', 'REVIEWER', 'SYSTEM_ADMIN'],
  })
  role!: string;
}
export class DirectoryDto {
  @ApiProperty({ type: [PersonDto] }) users!: PersonDto[];
  @ApiProperty({ type: [OrganizationChoiceDto] })
  organizations!: OrganizationChoiceDto[];
  @ApiProperty({ type: [MemberChoiceDto] }) members!: MemberChoiceDto[];
}
export class WorkspaceIdentityDto extends PersonDto {
  @ApiProperty({ type: [String] }) roles!: string[];
}
