import { ApiProperty } from '@nestjs/swagger';
import { IdDto } from '../authorization/authorization.dto.js';
import { RevisionDto } from '../materials/materials.dto.js';
export class EntryDto {
  @ApiProperty({ format: 'uuid' }) materialId!: string;
  @ApiProperty({ maxLength: 4000 }) text!: string;
  @ApiProperty({ type: [String], maxItems: 10 }) fileIds!: string[];
}
export class SaveDraftDto extends RevisionDto {
  @ApiProperty({ type: [EntryDto], maxItems: 50 }) entries!: EntryDto[];
}
export class DraftViewDto extends IdDto {
  @ApiProperty({ type: 'integer' }) revision!: number;
  @ApiProperty({ type: [EntryDto] }) entries!: EntryDto[];
  @ApiProperty({ type: String, nullable: true }) baseSubmissionId!:
    | string
    | null;
}
export class DeadlineDto {
  @ApiProperty() id!: string;
  @ApiProperty({ format: 'date-time' }) deadline!: string;
}
export class DeadlinesDto {
  @ApiProperty({ format: 'date-time' }) task!: string;
  @ApiProperty({ type: [DeadlineDto] }) materials!: DeadlineDto[];
}
export class ExecutionViewDto extends IdDto {
  @ApiProperty({ enum: ['EDITING', 'SUBMITTED', 'APPROVED', 'CLOSED'] })
  state!: string;
  @ApiProperty({ type: 'integer' }) revision!: number;
  @ApiProperty({ type: 'integer' }) generation!: number;
  @ApiProperty({ type: String, nullable: true }) currentSubmissionId!:
    | string
    | null;
  @ApiProperty({ type: DeadlinesDto }) deadlines!: DeadlinesDto;
}
export class UploadDto {
  @ApiProperty({ format: 'uuid' }) materialId!: string;
  @ApiProperty({ enum: ['txt', 'pdf', 'png', 'jpg', 'jpeg'] })
  extension!: string;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 10485760 })
  expectedBytes!: number;
  @ApiProperty({ pattern: '^[a-f0-9]{64}$' }) sha256!: string;
}
export class UploadViewDto extends IdDto {
  @ApiProperty({ enum: ['PENDING', 'CONFIRMED'] }) state!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
}
export class SubmitDto {
  @ApiProperty({ format: 'uuid' }) idempotencyKey!: string;
  @ApiProperty({ type: 'integer', minimum: 1 }) expectedDraftRevision!: number;
}
export class IssueDto {
  @ApiProperty({ format: 'uuid' }) materialId!: string;
  @ApiProperty({ maxLength: 2000 }) reason!: string;
  @ApiProperty({ maxLength: 2000 }) instruction!: string;
}
export class ReviewDto {
  @ApiProperty({ format: 'uuid' }) submissionId!: string;
  @ApiProperty({ enum: ['PASS', 'RETURN'] }) decision!: string;
  @ApiProperty({ type: [IssueDto], maxItems: 50 }) issues!: IssueDto[];
}
export class ReviewViewDto extends ReviewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) actorId!: string;
  @ApiProperty({ format: 'date-time' }) reviewedAt!: string;
}
export class SubmissionViewDto extends IdDto {
  @ApiProperty({ format: 'uuid' }) taskId!: string;
  @ApiProperty({ format: 'uuid' }) requirementVersionId!: string;
  @ApiProperty({ type: 'integer' }) version!: number;
  @ApiProperty({ type: 'integer' }) generation!: number;
  @ApiProperty({ format: 'uuid' }) actorId!: string;
  @ApiProperty({ format: 'date-time' }) submittedAt!: string;
  @ApiProperty({ type: [EntryDto] }) entries!: EntryDto[];
  @ApiProperty({ type: DeadlinesDto }) deadlines!: DeadlinesDto;
  @ApiProperty({ type: ReviewViewDto, nullable: true })
  review!: ReviewViewDto | null;
}
export class ExtendDto extends RevisionDto {
  @ApiProperty({ format: 'date-time' }) newDeadline!: string;
  @ApiProperty({ maxLength: 2000 }) reason!: string;
}
export class HandoverDto extends RevisionDto {
  @ApiProperty({ format: 'uuid' }) handlerMemberId!: string;
}
export class CloseDto extends RevisionDto {
  @ApiProperty({ maxLength: 2000 }) reason!: string;
}
export class DraftEditViewDto extends IdDto {
  @ApiProperty({ type: 'integer' }) revision!: number;
  @ApiProperty({ type: [EntryDto] }) entries!: EntryDto[];
  @ApiProperty({ format: 'uuid' }) actorId!: string;
  @ApiProperty() kind!: string;
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
}
export class DeadlineHistoryDto extends IdDto {
  @ApiProperty({ format: 'uuid' }) actorId!: string;
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
  @ApiProperty() reason!: string;
  @ApiProperty({ type: DeadlinesDto }) previous!: DeadlinesDto;
  @ApiProperty({ type: DeadlinesDto }) next!: DeadlinesDto;
}
