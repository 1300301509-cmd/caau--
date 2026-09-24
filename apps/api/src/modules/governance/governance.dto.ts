import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GovernanceFieldDto {
  @ApiProperty() label!: string;
  @ApiProperty() value!: string;
}
export class GovernanceRowDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() status!: string;
  @ApiProperty() at!: string;
  @ApiProperty({ type: String, nullable: true }) actorId!: string | null;
  @ApiProperty({ type: String, nullable: true }) requestId!: string | null;
  @ApiProperty({ type: String, nullable: true }) resourceId!: string | null;
  @ApiProperty({ type: [GovernanceFieldDto] }) fields!: GovernanceFieldDto[];
}
export class GovernancePageDto {
  @ApiProperty({ type: [GovernanceRowDto] }) items!: GovernanceRowDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
  @ApiProperty() asOf!: string;
}
export class GovernanceOverviewDto {
  @ApiProperty({ type: [GovernanceFieldDto] }) metrics!: GovernanceFieldDto[];
  @ApiProperty() asOf!: string;
}
export class GovernanceQueryDto {
  @ApiPropertyOptional() actorId?: string;
  @ApiPropertyOptional() eventId?: string;
  @ApiPropertyOptional() requestId?: string;
  @ApiPropertyOptional() resourceId?: string;
  @ApiPropertyOptional() phase?: string;
  @ApiPropertyOptional() mode?: string;
  @ApiPropertyOptional() action?: string;
  @ApiPropertyOptional() outcome?: string;
  @ApiPropertyOptional() organizationId?: string;
  @ApiPropertyOptional() model?: string;
  @ApiPropertyOptional() from?: string;
  @ApiPropertyOptional() to?: string;
  @ApiPropertyOptional() cursor?: string;
  @ApiPropertyOptional() limit?: string;
}
export class GovernanceReasonDto {
  @ApiProperty() reason!: string;
  @ApiPropertyOptional() cursor?: string;
}
export class GovernanceRevokeDto {
  @ApiProperty() reason!: string;
  @ApiPropertyOptional() sessionId?: string;
}
export class GovernanceResultDto {
  @ApiProperty() id!: string;
  @ApiProperty() message!: string;
}
export class GovernanceExportDto {
  @ApiProperty() csv!: string;
  @ApiProperty() count!: number;
}
export class AiAssignmentDto {
  @ApiProperty({ type: String, nullable: true }) organizationId!: string | null;
  @ApiProperty() reason!: string;
}
export class AiQuotaInputDto {
  @ApiProperty({ enum: ['ACCOUNT', 'ORGANIZATION'] }) scope!: string;
  @ApiProperty() subjectId!: string;
  @ApiProperty() enabled!: boolean;
  @ApiProperty() paused!: boolean;
  @ApiProperty({ type: Number, nullable: true }) dailyTokens!: number | null;
  @ApiProperty({ type: Number, nullable: true }) monthlyTokens!: number | null;
  @ApiProperty() expectedRevision!: number;
  @ApiProperty() reason!: string;
}
export class AiPriceInputDto {
  @ApiProperty() provider!: string;
  @ApiProperty() model!: string;
  @ApiProperty() currency!: string;
  @ApiProperty() inputMicrosPerMillion!: string;
  @ApiProperty() outputMicrosPerMillion!: string;
  @ApiProperty({ type: String, nullable: true }) cachedMicrosPerMillion!:
    | string
    | null;
  @ApiProperty() effectiveAt!: string;
  @ApiProperty() reason!: string;
}
export class AiBillInputDto {
  @ApiProperty() provider!: string;
  @ApiProperty() currency!: string;
  @ApiProperty() from!: string;
  @ApiProperty() to!: string;
  @ApiProperty() amountMicros!: string;
  @ApiProperty() note!: string;
}
export class AiResolveUsageDto {
  @ApiProperty() inputTokens!: number;
  @ApiProperty() outputTokens!: number;
  @ApiProperty() reason!: string;
}
export class GovernanceAlertUpdateDto {
  @ApiProperty() note!: string;
  @ApiProperty({ type: String, nullable: true }) ownerId!: string | null;
}
