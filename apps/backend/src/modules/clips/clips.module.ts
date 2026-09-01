import { Module, forwardRef } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { ProcessingModule } from '../processing/processing.module';
import { SettingsModule } from '../settings/settings.module';
import { ClipsController } from './clips.controller';
import { ClipsService } from './clips.service';
import { JsonClipRepository } from './repositories/json-clip.repository';
import { CLIP_REPOSITORY } from './tokens/clip-repository.token';

@Module({
  imports: [forwardRef(() => ProjectsModule), ProcessingModule, SettingsModule],
  controllers: [ClipsController],
  providers: [
    ClipsService,
    { provide: CLIP_REPOSITORY, useClass: JsonClipRepository },
  ],
  exports: [ClipsService],
})
export class ClipsModule {}
