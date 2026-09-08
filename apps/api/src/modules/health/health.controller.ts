import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthDto } from './status.dto.js';

@ApiTags('system')
@Controller('health')
export class HealthController {
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'getHealth',
    summary: 'API process liveness; independent of database',
  })
  @ApiOkResponse({ type: HealthDto })
  getHealth(): HealthDto {
    // Liveness only: does not claim database or external-service readiness.
    return { status: 'ok', service: 'caau-api' };
  }
}
