import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { VideoInfo } from '@ai-video-cutter/shared-types';
import { contentTypeForExtension, streamFile } from '../../common/utils/stream-file.util';
import { VideosService } from './videos.service';

@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Get(':projectId/info')
  getInfo(@Param('projectId') projectId: string): Promise<VideoInfo> {
    return this.videosService.getInfo(projectId);
  }

  @Get(':projectId/stream')
  async stream(@Param('projectId') projectId: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    const filePath = await this.videosService.getVideoFilePath(projectId);
    const ext = /\.[^./\\]+$/.exec(filePath)?.[0] ?? '';
    await streamFile(req, res, filePath, contentTypeForExtension(ext));
  }

  @Get(':projectId/thumbnail')
  async thumbnail(@Param('projectId') projectId: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    const filePath = await this.videosService.getThumbnailFilePath(projectId);
    await streamFile(req, res, filePath, 'image/jpeg');
  }
}
