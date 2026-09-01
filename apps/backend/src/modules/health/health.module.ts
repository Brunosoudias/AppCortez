import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { SettingsModule } from '../settings/settings.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [JobsModule, SettingsModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
