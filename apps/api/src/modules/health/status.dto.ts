import { ApiProperty } from '@nestjs/swagger';

export class HealthDto {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';

  @ApiProperty({ enum: ['caau-api'] })
  service!: 'caau-api';
}

export class ReadyDto {
  @ApiProperty({ enum: ['ready'] })
  status!: 'ready';

  @ApiProperty({ enum: ['caau-api'] })
  service!: 'caau-api';
}

export class NotReadyDto {
  @ApiProperty({ enum: ['not_ready'] })
  status!: 'not_ready';

  @ApiProperty({ enum: ['caau-api'] })
  service!: 'caau-api';

  @ApiProperty({ enum: ['DATABASE_UNAVAILABLE'] })
  code!: 'DATABASE_UNAVAILABLE';
}
