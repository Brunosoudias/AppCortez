import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { ProcessingModule } from '../processing/processing.module';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  imports: [ProjectsModule, ProcessingModule],
  controllers: [VideosController],
  providers: [VideosService],
})
export class VideosModule {}
