import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { IsBoolean, IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';
import type { Response } from 'express';
import type {
  CaptionStyle,
  ClipAspectRatio,
  ClipLayout,
  Job,
  Transcript,
  TranscriptAnalysis,
} from '@ai-video-cutter/shared-types';
import { IntelligenceService } from './intelligence.service';

class AutoClipsDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  maxMoments?: number;

  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(120)
  targetDuration?: number;

  @IsOptional()
  @IsIn(['16:9', '9:16', '1:1'])
  format?: ClipAspectRatio;

  @IsOptional()
  @IsIn(['crop', 'stack', 'title', 'blur'])
  layout?: ClipLayout;

  @IsOptional()
  @IsBoolean()
  render?: boolean;

  @IsOptional()
  @IsBoolean()
  burnCaptions?: boolean;
}

class CaptionsDto {
  @IsOptional()
  @IsIn(['clean', 'boxed', 'reels', 'karaoke'])
  style?: CaptionStyle;
}

class BurnCaptionsDto {
  @IsOptional()
  @IsIn(['srt', 'ass'])
  format?: 'srt' | 'ass';

  @IsOptional()
  @IsIn(['clean', 'boxed', 'reels', 'karaoke'])
  captionStyle?: CaptionStyle;
}

@Controller()
export class IntelligenceController {
  constructor(private readonly intelligence: IntelligenceService) {}

  @Post('projects/:id/transcribe')
  transcribe(@Param('id') id: string): Promise<Job> {
    return this.intelligence.enqueueTranscribe(id);
  }

  @Get('projects/:id/transcript')
  transcript(@Param('id') id: string): Promise<Transcript> {
    return this.intelligence.getTranscript(id);
  }

  @Post('projects/:id/analyze')
  analyze(@Param('id') id: string): Promise<Job> {
    return this.intelligence.enqueueAnalyze(id);
  }

  @Get('projects/:id/analysis')
  analysis(@Param('id') id: string): Promise<TranscriptAnalysis> {
    return this.intelligence.getAnalysis(id);
  }

  @Post('projects/:id/auto-clips')
  autoClips(@Param('id') id: string, @Body() body: AutoClipsDto): Promise<Job> {
    return this.intelligence.enqueueAutoClips(id, body ?? {});
  }

  @Post('projects/:id/export-batch')
  exportBatch(@Param('id') id: string): Promise<Job> {
    return this.intelligence.enqueueExportBatch(id);
  }

  @Post('projects/:id/captions')
  captions(@Param('id') id: string, @Body() body: CaptionsDto) {
    return this.intelligence.ensureCaptions(id, body?.style);
  }

  @Get('projects/:id/captions/:kind')
  async downloadCaption(
    @Param('id') id: string,
    @Param('kind') kind: string,
    @Res() res: Response,
  ): Promise<void> {
    const fileKind = kind === 'ass' ? 'ass' : 'srt';
    const content = await this.intelligence.getCaptionFile(id, fileKind);
    res.setHeader('Content-Type', fileKind === 'ass' ? 'text/plain; charset=utf-8' : 'application/x-subrip');
    res.setHeader('Content-Disposition', `attachment; filename="captions.${fileKind}"`);
    res.send(content);
  }

  @Get('projects/:id/face-track')
  faceTrack(
    @Param('id') id: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.intelligence.getFaceTrack(
      id,
      start != null ? Number(start) : undefined,
      end != null ? Number(end) : undefined,
    );
  }

  @Post('projects/:projectId/clips/:clipId/burn-captions')
  burn(
    @Param('projectId') projectId: string,
    @Param('clipId') clipId: string,
    @Body() body: BurnCaptionsDto,
  ): Promise<Job> {
    return this.intelligence.enqueueBurnCaptions(
      projectId,
      clipId,
      body?.format ?? 'ass',
      body?.captionStyle,
    );
  }

  @Post('projects/:projectId/clips/:clipId/queue-render')
  queueRender(
    @Param('projectId') projectId: string,
    @Param('clipId') clipId: string,
  ): Promise<Job> {
    return this.intelligence.enqueueRender(projectId, clipId);
  }
}
