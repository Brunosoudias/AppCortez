import { Injectable } from '@nestjs/common';
import type { VideoInfo } from '@ai-video-cutter/shared-types';
import { ProjectsService } from '../projects/projects.service';
import { FfmpegService } from '../processing/services/ffmpeg.service';

@Injectable()
export class VideosService {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly ffmpeg: FfmpegService,
  ) {}

  async getInfo(projectId: string): Promise<VideoInfo> {
    const project = await this.projectsService.findById(projectId);
    const filePath = this.projectsService.getOriginalFilePath(project);
    return this.ffmpeg.getVideoInfo(filePath);
  }

  async getVideoFilePath(projectId: string): Promise<string> {
    const project = await this.projectsService.findById(projectId);
    return this.projectsService.getOriginalFilePath(project);
  }

  async getThumbnailFilePath(projectId: string): Promise<string> {
    const project = await this.projectsService.findById(projectId);
    return this.projectsService.getThumbnailFilePath(project);
  }
}
