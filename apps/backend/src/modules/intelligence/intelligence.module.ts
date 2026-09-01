import { Module, forwardRef } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { ClipsModule } from '../clips/clips.module';
import { ProcessingModule } from '../processing/processing.module';
import { JobsModule } from '../jobs/jobs.module';
import { SettingsModule } from '../settings/settings.module';
import { IntelligenceController } from './intelligence.controller';
import { IntelligenceService } from './intelligence.service';

@Module({
  imports: [
    ProcessingModule,
    SettingsModule,
    JobsModule,
    forwardRef(() => ProjectsModule),
    forwardRef(() => ClipsModule),
  ],
  controllers: [IntelligenceController],
  providers: [IntelligenceService],
  exports: [IntelligenceService],
})
export class IntelligenceModule {}
