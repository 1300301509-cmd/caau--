import { ApiProperty } from '@nestjs/swagger';
import { IdDto } from '../authorization/authorization.dto.js';
export class TemplateUploadDto {
  @ApiProperty({ format: 'uuid' }) materialId!: string;
  @ApiProperty({ maxLength: 1024 }) originalName!: string;
  @ApiProperty({ enum: ['txt', 'pdf', 'png', 'jpg', 'jpeg'] })
  extension!: string;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 10485760 })
  expectedBytes!: number;
  @ApiProperty({ pattern: '^[a-f0-9]{64}$' }) sha256!: string;
}
export class TemplateUploadViewDto extends IdDto {
  @ApiProperty({ enum: ['PENDING', 'CONFIRMED'] }) state!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
}
export class TemplateFileDto extends IdDto {
  @ApiProperty({ format: 'uuid' }) materialId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() extension!: string;
  @ApiProperty({ type: 'integer' }) bytes!: number;
  @ApiProperty() originalNameKnown!: boolean;
}
