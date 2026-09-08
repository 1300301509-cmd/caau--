import { ApiProperty } from '@nestjs/swagger';
export class UploadCapabilitiesDto {
  @ApiProperty({ type: [String] }) formats!: string[];
  @ApiProperty({ type: 'integer' }) maxBytes!: number;
}
