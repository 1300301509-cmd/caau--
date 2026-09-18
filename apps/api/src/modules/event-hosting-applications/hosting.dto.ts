import { ApiProperty } from '@nestjs/swagger';

export const hostingStatuses = [
  'DRAFT',
  'PENDING_REVIEW',
  'IN_REVIEW',
  'NEEDS_SUPPLEMENT',
  'REJECTED',
  'APPROVED',
] as const;
export const hostingRequirementCodes = [
  'BUSINESS_LICENSE',
  'VENUE_PHOTO',
  'OTHER_DOCUMENT',
] as const;

export class HostingGrantInputDto {
  @ApiProperty({ format: 'uuid' }) memberId!: string;
}
export class HostingGrantViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) memberId!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  organizationId!: string | null;
  @ApiProperty() active!: boolean;
}
export class HostingGrantActiveDto {
  @ApiProperty() active!: boolean;
}
export class CreateEventMaterialsDto {
  @ApiProperty({ format: 'uuid' }) eventId!: string;
  @ApiProperty({ format: 'uuid' }) key!: string;
}
export class CreateHostingApplicationDto {
  @ApiProperty({ type: Number, enum: [1, 2], required: false })
  formVersion?: number;
  @ApiProperty({ format: 'uuid' }) applicantOrganizationId!: string;
  @ApiProperty({ format: 'uuid' }) key!: string;
}
export class HostingAdministrativeAreaDto {
  @ApiProperty({ maxLength: 40 }) province!: string;
  @ApiProperty({ maxLength: 60 }) city!: string;
  @ApiProperty({ type: String, maxLength: 60, nullable: true })
  district!: string | null;
}
export class HostingLocationDto {
  @ApiProperty({ type: HostingAdministrativeAreaDto })
  administrativeArea!: HostingAdministrativeAreaDto;
  @ApiProperty({ maxLength: 240 }) detailedAddress!: string;
  @ApiProperty({ maxLength: 120 }) venueName!: string;
}
export class HostingDraftFormDto {
  @ApiProperty({ type: String, required: false, nullable: true }) contactName?:
    | string
    | null;
  @ApiProperty({ type: String, required: false, nullable: true }) startTime?:
    | string
    | null;
  @ApiProperty({ type: String, required: false, nullable: true }) endTime?:
    | string
    | null;
  @ApiProperty({ type: String, required: false, nullable: true })
  additionalNotes?: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    required: false,
    maxLength: 200,
  })
  bankAccountName?: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    required: false,
    maxLength: 200,
  })
  bankName?: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    required: false,
    maxLength: 200,
  })
  bankAccountNumber?: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    required: false,
    maxLength: 200,
  })
  registrationStart?: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    required: false,
    maxLength: 200,
  })
  registrationEnd?: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    required: false,
    maxLength: 200,
  })
  contactPhone?: string | null;

  @ApiProperty({ type: String, maxLength: 120, nullable: true })
  eventName!: string | null;
  @ApiProperty({ type: String, format: 'date', nullable: true })
  startDate!: string | null;
  @ApiProperty({ type: String, format: 'date', nullable: true })
  endDate!: string | null;
  @ApiProperty({ type: HostingLocationDto, nullable: true })
  location!: HostingLocationDto | null;
  @ApiProperty({ type: String, maxLength: 20000, nullable: true })
  eventExperienceIntroduction!: string | null;
}
export class SaveHostingDraftDto {
  @ApiProperty({ type: 'integer', minimum: 1 }) expectedDraftRevision!: number;
  @ApiProperty({ type: HostingDraftFormDto }) form!: HostingDraftFormDto;
}
export class HostingSubmitDto {
  @ApiProperty({ type: 'integer', minimum: 1 }) expectedDraftRevision!: number;
  @ApiProperty({ type: 'integer', minimum: 1 }) expectedRevision!: number;
  @ApiProperty({ format: 'uuid' }) key!: string;
}
export class HostingReviewCommandDto {
  @ApiProperty({ format: 'uuid' }) submissionId!: string;
  @ApiProperty({ type: 'integer', minimum: 1 }) expectedRevision!: number;
  @ApiProperty({ format: 'uuid' }) key!: string;
}
export class HostingReasonCommandDto extends HostingReviewCommandDto {
  @ApiProperty({ maxLength: 2000 }) reason!: string;
}
export class HostingUploadInputDto {
  @ApiProperty({ enum: hostingRequirementCodes })
  requirementCode!: (typeof hostingRequirementCodes)[number];
  @ApiProperty({ maxLength: 180 }) originalName!: string;
  @ApiProperty({ enum: ['pdf', 'png', 'jpg', 'jpeg'] }) extension!: string;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 10485760 })
  expectedBytes!: number;
  @ApiProperty({ minLength: 64, maxLength: 64 }) sha256!: string;
}
export class HostingUploadMutationDto {
  @ApiProperty({ type: 'integer', minimum: 1 }) expectedDraftRevision!: number;
}
export class HostingUploadViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: hostingRequirementCodes }) requirementCode!: string;
  @ApiProperty() originalName!: string;
  @ApiProperty() extension!: string;
  @ApiProperty({ type: 'integer' }) expectedBytes!: number;
  @ApiProperty({ enum: ['PENDING', 'CONFIRMED'] }) state!: string;
  @ApiProperty() bound!: boolean;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
}
export class HostingSubmissionViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: 'integer' }) version!: number;
  @ApiProperty({ type: 'object', additionalProperties: true }) form!: object;
  @ApiProperty({ format: 'uuid' }) submittedBy!: string;
  @ApiProperty({ format: 'date-time' }) submittedAt!: string;
  @ApiProperty({ type: [HostingUploadViewDto] })
  attachments!: HostingUploadViewDto[];
}
export class HostingActionViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() action!: string;
  @ApiProperty({ enum: hostingStatuses }) fromState!: string;
  @ApiProperty({ enum: hostingStatuses }) toState!: string;
  @ApiProperty({ format: 'uuid' }) actorId!: string;
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) detail!: object;
}
export class HostingDiffViewDto {
  @ApiProperty({ format: 'uuid' }) fromSubmissionId!: string;
  @ApiProperty({ format: 'uuid' }) toSubmissionId!: string;
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  fieldChanges!: object[];
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  attachmentChanges!: object[];
}
export class HostingApplicationListItemDto {
  @ApiProperty({ type: Number }) formVersion!: number;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  materialEventId!: string | null;
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) applicantOrganizationId!: string;
  @ApiProperty() applicantOrganizationName!: string;
  @ApiProperty({ enum: hostingStatuses }) status!: string;
  @ApiProperty({ type: 'integer' }) revision!: number;
  @ApiProperty({ type: 'integer' }) draftRevision!: number;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  currentSubmissionId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  approvedEventId!: string | null;
  @ApiProperty({
    description: 'Current actor has active application review access',
  })
  canReview!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}
export class HostingApplicationDetailDto extends HostingApplicationListItemDto {
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  draft!: object | null;
  @ApiProperty({ type: [HostingUploadViewDto] })
  uploads!: HostingUploadViewDto[];
  @ApiProperty({ type: [HostingSubmissionViewDto] })
  submissions!: HostingSubmissionViewDto[];
  @ApiProperty({ type: [HostingActionViewDto] })
  actions!: HostingActionViewDto[];
  @ApiProperty({ type: [HostingDiffViewDto] }) diffs!: HostingDiffViewDto[];
}

export class HostingPermitDto {
  @ApiProperty({ format: 'uuid' }) confirmedBy!: string;
  @ApiProperty({ format: 'date-time' }) confirmedAt!: string;
}
export class HostingJourneyDto {
  @ApiProperty({ format: 'uuid' }) applicationId!: string;
  @ApiProperty({ type: String, nullable: true }) materialApplicationId!:
    | string
    | null;
  @ApiProperty() eventName!: string;
  @ApiProperty() organizationName!: string;
  @ApiProperty() applicationStatus!: string;
  @ApiProperty({ type: String, nullable: true }) materialStatus!: string | null;
  @ApiProperty({ enum: ['APPLICATION', 'MATERIALS', 'CONTRACT', 'PERMITTED'] })
  stage!: string;
  @ApiProperty() canConfirm!: boolean;
  @ApiProperty({ type: HostingPermitDto, nullable: true })
  permit!: HostingPermitDto | null;
  @ApiProperty() updatedAt!: string;
  @ApiProperty({ type: [HostingActionViewDto] })
  history!: HostingActionViewDto[];
}
export class ConfirmHostingPermitDto {
  @ApiProperty({ format: 'uuid' }) key!: string;
  @ApiProperty({ format: 'uuid' }) submissionId!: string;
}
