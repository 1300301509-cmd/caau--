import { Controller, Get, Header } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  @Header('Cache-Control', 'no-store')
  getHealth(): { status: 'ok'; service: 'caau-api' } {
    // Liveness only: does not claim database or external-service readiness.
    return { status: 'ok', service: 'caau-api' };
  }
}
