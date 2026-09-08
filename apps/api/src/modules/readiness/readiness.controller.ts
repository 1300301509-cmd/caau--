import {
  Controller,
  Get,
  Header,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../authorization/authorization.guard.js';
import { ReadyDto, NotReadyDto } from '../health/status.dto.js';
import { DatabaseReadinessService } from './readiness.service.js';

@ApiTags('system')
@Controller('ready')
export class ReadinessController {
  constructor(private readonly readiness: DatabaseReadinessService) {}

  @Public()
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'getReadiness',
    summary:
      'Database connectivity; 1500ms application deadline, not schema readiness',
  })
  @ApiOkResponse({ type: ReadyDto })
  @ApiServiceUnavailableResponse({ type: NotReadyDto })
  async getReadiness(): Promise<ReadyDto> {
    if (!(await this.readiness.isReady())) {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        service: 'caau-api',
        code: 'DATABASE_UNAVAILABLE',
      } satisfies NotReadyDto);
    }
    return { status: 'ready', service: 'caau-api' };
  }
}
