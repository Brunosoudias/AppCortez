import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Clip } from '@ai-video-cutter/shared-types';
import { contentTypeForExtension, streamFile } from '../../common/utils/stream-file.util';
import { CreateClipDto } from './dto/create-clip.dto';
import { UpdateClipFramingDto } from './dto/update-clip-framing.dto';
import { UpdateClipCaptionsDto } from './dto/update-clip-captions.dto';
import { UpdateClipLayoutDto } from './dto/update-clip-layout.dto';
import { UpdateClipTextDto } from './dto/update-clip-text.dto';
import { UpdateClipZoomDto } from './dto/update-clip-zoom.dto';
import { ClipsService } from './clips.service';

@Controller()
export class ClipsController {
  constructor(private readonly clipsService: ClipsService) {}

  @Post('projects/:id/clips')
  create(@Param('id') projectId: string, @Body() dto: CreateClipDto): Promise<Clip> {
    return this.clipsService.create(projectId, dto);
  }

  @Get('projects/:id/clips')
  findAll(@Param('id') projectId: string): Promise<Clip[]> {
    return this.clipsService.findAllByProject(projectId);
  }

  @Get('clips/:id')
  findOne(@Param('id') id: string): Promise<Clip> {
    return this.clipsService.findById(id);
  }

  @Delete('clips/:id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.clipsService.delete(id);
  }

  @Post('clips/:id/cancel')
  cancel(@Param('id') id: string): Promise<Clip> {
    return this.clipsService.cancel(id);
  }

  @Post('projects/:id/clips/cancel-pending')
  cancelPending(@Param('id') projectId: string): Promise<{ cancelled: number }> {
    return this.clipsService.cancelPendingByProject(projectId);
  }

  @Patch('clips/:id/framing')
  updateFraming(@Param('id') id: string, @Body() dto: UpdateClipFramingDto): Promise<Clip> {
    return this.clipsService.updateFraming(id, dto);
  }

  /** Liga/desliga legendas queimadas neste corte. */
  @Patch('clips/:id/captions')
  setCaptions(@Param('id') id: string, @Body() dto: UpdateClipCaptionsDto): Promise<Clip> {
    return this.clipsService.setCaptionsEnabled(id, dto.enabled);
  }

  /** 9:16 completo (crop) ou vídeo em cima + painel de texto (title). */
  @Patch('clips/:id/layout')
  setLayout(@Param('id') id: string, @Body() dto: UpdateClipLayoutDto): Promise<Clip> {
    return this.clipsService.updateLayout(id, dto.layout, dto.rerender);
  }

  /** Texto do painel inferior (layout title). */
  @Patch('clips/:id/text')
  setText(@Param('id') id: string, @Body() dto: UpdateClipTextDto): Promise<Clip> {
    return this.clipsService.updateText(id, dto);
  }

  /** Zoom do vídeo central (layout blur). */
  @Patch('clips/:id/zoom')
  setZoom(@Param('id') id: string, @Body() dto: UpdateClipZoomDto): Promise<Clip> {
    return this.clipsService.updateCenterZoom(id, dto.centerZoom, dto.rerender);
  }

  @Post('projects/:id/clips/framing')
  applyFramingToAll(
    @Param('id') projectId: string,
    @Body() dto: UpdateClipFramingDto,
  ): Promise<{ updated: number }> {
    return this.clipsService.applyFramingToProject(projectId, dto);
  }

  @Post('clips/:id/render')
  render(@Param('id') id: string): Promise<Clip> {
    return this.clipsService.render(id);
  }

  @Get('clips/:id/stream')
  async stream(@Param('id') id: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    const clip = await this.clipsService.findById(id);
    const filePath = this.clipsService.getOutputFilePath(clip);
    await streamFile(req, res, filePath, contentTypeForExtension('.mp4'));
  }

  @Get('clips/:id/download')
  async download(@Param('id') id: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    const clip = await this.clipsService.findById(id);
    const filePath = this.clipsService.getOutputFilePath(clip);
    const safeTitle = (clip.title || `corte-${clip.id}`)
      .replace(/[^\w\-À-ÿ]+/gi, '_')
      .slice(0, 60);
    const filename = `${safeTitle || clip.id}.mp4`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await streamFile(req, res, filePath, contentTypeForExtension('.mp4'));
  }
}
