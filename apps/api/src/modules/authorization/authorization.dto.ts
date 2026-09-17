import { ApiProperty } from '@nestjs/swagger';

export const roles = [
  'EVENT_MANAGER',
  'ORGANIZER',
  'REVIEWER',
  'SYSTEM_ADMIN',
  'HEADQUARTERS_SUPER_ADMIN',
] as const;
export const taskActions = [
  'task.read',
  'content.write',
  'review',
  'file.download',
] as const;
export class IdDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
}
export const localIdentityKeys = [
  'event-manager',
  'reviewer-a',
  'reviewer-b',
  'organizer-a',
  'organizer-b',
] as const;
export class LocalIdentityChoiceDto {
  @ApiProperty({ enum: localIdentityKeys })
  key!: (typeof localIdentityKeys)[number];
  @ApiProperty() displayName!: string;
  @ApiProperty() organizationName!: string;
  @ApiProperty({ enum: roles }) role!: (typeof roles)[number];
}
export class LocalSessionRequestDto {
  @ApiProperty({ enum: localIdentityKeys })
  identity!: (typeof localIdentityKeys)[number];
}
export class LocalSessionDto {
  @ApiProperty({ enum: localIdentityKeys })
  identity!: (typeof localIdentityKeys)[number];
  @ApiProperty() token!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
}
export class LoginRequestDto {
  @ApiProperty({ minLength: 3, maxLength: 64 }) loginName!: string;
  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  password!: string;
}
export class AuthenticationSessionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: roles, isArray: true })
  roles!: Array<(typeof roles)[number]>;
  @ApiProperty() mustChangePassword!: boolean;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty({ writeOnly: true }) csrfToken!: string;
}
export class ChangePasswordDto {
  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  currentPassword!: string;
  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  newPassword!: string;
}
export class AccountMembershipInputDto {
  @ApiProperty({ format: 'uuid' }) organizationId!: string;
  @ApiProperty({ enum: roles }) role!: (typeof roles)[number];
}
export class CreateAccountDto {
  @ApiProperty({ minLength: 3, maxLength: 64 }) loginName!: string;
  @ApiProperty({ maxLength: 80 }) displayName!: string;
  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  temporaryPassword!: string;
  @ApiProperty({ type: [AccountMembershipInputDto] })
  memberships!: AccountMembershipInputDto[];
}
export class ResetPasswordDto {
  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  temporaryPassword!: string;
}
export class AccountMembershipDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) organizationId!: string;
  @ApiProperty() organizationName!: string;
  @ApiProperty({ enum: roles }) role!: (typeof roles)[number];
  @ApiProperty() active!: boolean;
}
export class AccountEventGrantDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) eventId!: string;
  @ApiProperty({ format: 'uuid' }) memberId!: string;
  @ApiProperty({ nullable: true, type: String }) eventName!: string | null;
  @ApiProperty() active!: boolean;
}
export class AccountHostingGrantDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) memberId!: string;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' })
  organizationId!: string | null;
  @ApiProperty() active!: boolean;
}
export class AccountSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ nullable: true, type: String }) loginName!: string | null;
  @ApiProperty() active!: boolean;
  @ApiProperty() passwordConfigured!: boolean;
  @ApiProperty() mustChangePassword!: boolean;
  @ApiProperty({ type: [AccountMembershipDto] })
  memberships!: AccountMembershipDto[];
  @ApiProperty({ type: [String], format: 'uuid' }) eventGrantIds!: string[];
  @ApiProperty({ type: [AccountEventGrantDto] })
  eventGrants!: AccountEventGrantDto[];
  @ApiProperty({ nullable: true, type: AccountHostingGrantDto })
  hostingHandlerGrant!: AccountHostingGrantDto | null;
  @ApiProperty({ nullable: true, type: AccountHostingGrantDto })
  hostingReviewGrant!: AccountHostingGrantDto | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' })
  hostingHandlerGrantId!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' })
  hostingReviewGrantId!: string | null;
}
export class UserDto {
  @ApiProperty({ maxLength: 80 }) displayName!: string;
}
export class OrganizationDto {
  @ApiProperty({ maxLength: 120 }) name!: string;
}
export class MemberDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ format: 'uuid' }) organizationId!: string;
  @ApiProperty({ enum: roles }) role!: (typeof roles)[number];
}
export class ActiveDto {
  @ApiProperty() active!: boolean;
}
export class GrantDto {
  @ApiProperty({ format: 'uuid' }) eventId!: string;
  @ApiProperty({ format: 'uuid' }) memberId!: string;
}
export class TaskDto {
  @ApiProperty({ format: 'uuid' }) eventId!: string;
  @ApiProperty({ format: 'uuid' }) handlerGrantId!: string;
}
export class ReviewerDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  reviewerGrantId!: string | null;
}
export class AccessDto {
  @ApiProperty({ enum: taskActions }) action!: (typeof taskActions)[number];
}
export class AuditDto {
  @ApiProperty({ type: 'object', additionalProperties: true })
  context!: Record<string, string | number | boolean | null>;
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
  @ApiProperty({ nullable: true, type: String }) actorId!: string | null;
  @ApiProperty() action!: string;
  @ApiProperty({ nullable: true, type: String }) resourceId!: string | null;
  @ApiProperty() outcome!: string;
  @ApiProperty({ format: 'uuid' }) requestId!: string;
}
