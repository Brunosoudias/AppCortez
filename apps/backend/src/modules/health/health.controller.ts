import { Controller, Get, Post, Query } from '@nestjs/common';
import type { CleanupResult, SystemHealth } from '@ai-video-cutter/shared-types';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('health')
  check(): { status: string } {
    return { status: 'ok' };
  }

  @Get('health/system')
  system(): Promise<SystemHealth> {
    return this.health.getSystemHealth();
  }

  @Post('maintenance/cleanup')
  cleanup(@Query('jobs') jobs?: string): Promise<CleanupResult> {
    const clearJobs = jobs !== '0' && jobs !== 'false';
    return this.health.cleanupTemp(clearJobs);
  }
}
