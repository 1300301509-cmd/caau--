import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AgentSkillInputDto {
  @ApiProperty({
    enum: ['INTENT_ROUTING', 'TOOL_SELECTION', 'SCHEDULE_PLANNING'],
  })
  skillKey!: 'INTENT_ROUTING' | 'TOOL_SELECTION' | 'SCHEDULE_PLANNING';
  @ApiProperty({ maxLength: 8000 }) instructions!: string;
}

export class AgentSkillVersionDto extends AgentSkillInputDto {
  @ApiProperty() id!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ enum: ['DRAFT', 'ACTIVE', 'RETIRED'] })
  state!: 'DRAFT' | 'ACTIVE' | 'RETIRED';
  @ApiProperty() createdAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  activatedAt!: string | null;
}

export class AgentToolDefinitionDto {
  @ApiProperty() name!: string;
  @ApiProperty() version!: string;
  @ApiProperty({ enum: ['READ', 'REQUIREMENTS', 'PREVIEW', 'DRAFT_WRITE'] })
  risk!: string;
  @ApiProperty() permission!: string;
  @ApiProperty() confirmation!: string;
}
