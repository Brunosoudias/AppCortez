import { Controller, Delete, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import type { Job } from '@ai-video-cutter/shared-types';
import { JobQueueService } from './job-queue.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobQueueService) {}

  @Get()
  list(@Query('projectId') projectId?: string): Job[] {
    if (projectId) return this.jobs.listByProject(projectId);
    return this.jobs.list();
  }

  @Get('stats/summary')
  stats() {
    return this.jobs.counts();
  }

  @Get(':id')
  get(@Param('id') id: string): Job {
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundException('Job não encontrado');
    return job;
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string): Promise<Job> {
    const job = await this.jobs.cancel(id);
    if (!job) throw new NotFoundException('Job não encontrado');
    return job;
  }

  @Delete('finished')
  async clearFinished(): Promise<{ cleared: number }> {
    const cleared = await this.jobs.clearFinished();
    return { cleared };
  }
}
