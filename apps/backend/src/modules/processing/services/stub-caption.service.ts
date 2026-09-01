import { Injectable } from '@nestjs/common';
import type { Transcript } from '@ai-video-cutter/shared-types';
import { NotImplementedException } from '../../../common/utils/not-implemented.exception';
import type { CaptionService } from '../interfaces/caption-service.interface';

/**
 * Implementação placeholder de CaptionService. A V2 implementará a geração
 * real de .srt/.ass e a queima de legendas via FfmpegService.
 */
@Injectable()
export class StubCaptionService implements CaptionService {
  async generateSrt(_transcript: Transcript): Promise<string> {
    throw new NotImplementedException('CaptionService.generateSrt');
  }

  async generateAss(_transcript: Transcript): Promise<string> {
    throw new NotImplementedException('CaptionService.generateAss');
  }

  async burnCaptions(_videoPath: string, _captionsPath: string, _outputPath: string): Promise<void> {
    throw new NotImplementedException('CaptionService.burnCaptions');
  }
}
