import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
export const individualStates = [
  'DRAFT',
  'PENDING_REVIEW',
  'IN_REVIEW',
  'RETURNED',
  'APPROVED',
] as const;
export class IndividualContentDto {
  @ApiProperty() title!: string;
  @ApiProperty() category!: string;
  @ApiProperty() text!: string;
  @ApiProperty({ type: [String] }) fileIds!: string[];
}
export class CreateIndividualTaskDto {
  @ApiProperty({ format: 'uuid' }) eventId!: string;
  @ApiProperty({ format: 'uuid' }) organizationId!: string;
  @ApiProperty({ format: 'uuid' }) handlerMemberId!: string;
  @ApiProperty() title!: string;
}
export class ActivateIndividualDto {
  @ApiProperty() expectedRevision!: number;
  @ApiProperty() reason!: string;
}
export class CreateIndividualDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) taskId!: string;
  @ApiProperty({ format: 'uuid' }) key!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) requirementItemId?:
    | string
    | null;
  @ApiProperty({ type: IndividualContentDto }) content!: IndividualContentDto;
}
export class SaveIndividualDto {
  @ApiProperty() expectedDraftRevision!: number;
  @ApiProperty() generation!: number;
  @ApiProperty({ type: IndividualContentDto }) content!: IndividualContentDto;
}
export class IndividualCommandDto {
  @ApiProperty({ format: 'uuid' }) key!: string;
  @ApiProperty() expectedRevision!: number;
  @ApiProperty() generation!: number;
  @ApiPropertyOptional() expectedDraftRevision?: number;
  @ApiPropertyOptional({ format: 'uuid' }) submissionId?: string;
  @ApiPropertyOptional() reason?: string;
  @ApiPropertyOptional() modification?: string;
}
export class IndividualActionDto {
  @ApiProperty() id!: string;
  @ApiProperty() revision!: number;
  @ApiProperty() action!: string;
  @ApiProperty({ enum: individualStates }) fromState!: string;
  @ApiProperty({ enum: individualStates }) toState!: string;
  @ApiProperty({ type: String, nullable: true }) submissionId!: string | null;
  @ApiProperty() actorId!: string;
  @ApiProperty() actorName!: string;
  @ApiProperty() occurredAt!: string;
  @ApiProperty() reason!: string;
  @ApiProperty() modification!: string;
  @ApiProperty({ type: IndividualContentDto, nullable: true })
  content!: IndividualContentDto | null;
}
export class IndividualSubmissionDto {
  @ApiProperty() id!: string;
  @ApiProperty() version!: number;
  @ApiProperty() actorId!: string;
  @ApiProperty() actorName!: string;
  @ApiProperty() occurredAt!: string;
  @ApiProperty() generation!: number;
  @ApiProperty() deadline!: string;
  @ApiProperty({ type: IndividualContentDto }) content!: IndividualContentDto;
}
export class IndividualViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() taskId!: string;
  @ApiProperty({ enum: individualStates }) state!: string;
  @ApiProperty() revision!: number;
  @ApiProperty() draftRevision!: number;
  @ApiProperty() generation!: number;
  @ApiProperty() contextRevision!: number;
  @ApiProperty() closed!: boolean;
  @ApiProperty() deadline!: string;
  @ApiProperty({ type: String, nullable: true }) currentSubmissionId!:
    | string
    | null;
  @ApiProperty({ type: IndividualContentDto, nullable: true })
  draft!: IndividualContentDto | null;
  @ApiProperty({ type: IndividualSubmissionDto, nullable: true })
  submission!: IndividualSubmissionDto | null;
  @ApiProperty({ type: IndividualActionDto, nullable: true })
  lastAction!: IndividualActionDto | null;
}
export class IndividualSnapshotDto {
  @ApiProperty() serverTime!: string;
  @ApiProperty() total!: number;
  @ApiProperty({ type: [IndividualViewDto] }) items!: IndividualViewDto[];
  @ApiProperty({ type: IndividualViewDto, nullable: true })
  selected!: IndividualViewDto | null;
}
export class IndividualHistoryDto {
  @ApiProperty() materialRevision!: number;
  @ApiProperty() serverTime!: string;
  @ApiProperty() total!: number;
  @ApiProperty({ type: [IndividualActionDto] }) actions!: IndividualActionDto[];
  @ApiProperty({ type: [IndividualSubmissionDto] })
  submissions!: IndividualSubmissionDto[];
}
export class IndividualResultDto {
  @ApiProperty() resultRevision!: number;
  @ApiProperty({ type: String, nullable: true }) resultSubmissionId!:
    | string
    | null;
  @ApiProperty({ type: IndividualViewDto }) current!: IndividualViewDto;
}
export class IndividualConflictDto {
  @ApiProperty() code!: string;
  @ApiProperty() message!: string;
  @ApiProperty({ type: IndividualViewDto }) current!: IndividualViewDto;
}
export class IndividualGrantDto {
  @ApiProperty() active!: boolean;
}
export class IndividualUploadInputDto {
  @ApiProperty() originalName!: string;
  @ApiProperty() extension!: string;
  @ApiProperty() expectedBytes!: number;
  @ApiProperty() sha256!: string;
  @ApiProperty() generation!: number;
}
export class IndividualUploadDto {
  @ApiProperty() id!: string;
  @ApiProperty() originalName!: string;
  @ApiProperty() extension!: string;
  @ApiProperty() expectedBytes!: number;
  @ApiProperty({ enum: ['PENDING', 'CONFIRMED'] }) state!: string;
}
