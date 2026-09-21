import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const eventSupplyStatuses = [
  'TO_PREPARE',
  'PREPARING',
  'READY',
  'SHORTAGE',
] as const;

export class EventSupplyPhotoViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() originalName!: string;
  @ApiProperty({ enum: ['png', 'jpg', 'jpeg'] }) extension!: string;
  @ApiProperty({ type: 'integer' }) expectedBytes!: number;
  @ApiProperty({ enum: ['PENDING', 'CONFIRMED', 'REMOVED'] }) state!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  confirmedAt!: string | null;
}

export class EventSupplyItemViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) eventId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: 'integer', minimum: 1 }) quantity!: number;
  @ApiProperty() notes!: string;
  @ApiProperty({ enum: eventSupplyStatuses }) status!: string;
  @ApiProperty({ type: 'integer', minimum: 1 }) revision!: number;
  @ApiProperty({ type: [EventSupplyPhotoViewDto] })
  photos!: EventSupplyPhotoViewDto[];
  @ApiProperty({ format: 'uuid' }) createdBy!: string;
  @ApiProperty({ format: 'uuid' }) updatedBy!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class CreateEventSupplyItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ maxLength: 120 }) name!: string;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 1000000 })
  quantity!: number;
  @ApiPropertyOptional({ maxLength: 2000 }) notes?: string;
}

export class UpdateEventSupplyItemDto {
  @ApiProperty({ type: 'integer', minimum: 1 }) expectedRevision!: number;
  @ApiProperty({ maxLength: 120 }) name!: string;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 1000000 })
  quantity!: number;
  @ApiProperty({ maxLength: 2000 }) notes!: string;
  @ApiProperty({ enum: eventSupplyStatuses })
  status!: (typeof eventSupplyStatuses)[number];
}

export class CreateEventSupplyPhotoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ maxLength: 180 }) originalName!: string;
  @ApiProperty({ enum: ['png', 'jpg', 'jpeg'] }) extension!: string;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 10485760 })
  expectedBytes!: number;
  @ApiProperty({ minLength: 64, maxLength: 64 }) sha256!: string;
}

export class MutateEventSupplyPhotoDto {
  @ApiProperty({ type: 'integer', minimum: 1 }) expectedRevision!: number;
}

export class EventSupplyHistoryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: 'integer' }) revision!: number;
  @ApiProperty() action!: string;
  @ApiProperty({ type: 'object', additionalProperties: true })
  snapshot!: object;
  @ApiProperty({ format: 'uuid' }) actorId!: string;
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
}
