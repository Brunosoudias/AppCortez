import { Module } from '@nestjs/common';
import { JobQueueService } from './job-queue.service';
import { JobsController } from './jobs.controller';

@Module({
  controllers: [JobsController],
  providers: [JobQueueService],
  exports: [JobQueueService],
})
export class JobsModule {}
