import type { Transcript } from '@ai-video-cutter/shared-types';
import type { CaptionStyle } from '@ai-video-cutter/shared-types';

export interface GenerateCaptionsOptions {
  style?: CaptionStyle;
  playResX?: number;
  playResY?: number;
}

/**
 * Contrato do serviço de legendas (SRT/ASS + burn-in via FFmpeg).
 */
export interface CaptionService {
  generateSrt(transcript: Transcript): Promise<string>;
  generateAss(transcript: Transcript, options?: GenerateCaptionsOptions): Promise<string>;
  burnCaptions(videoPath: string, captionsPath: string, outputPath: string): Promise<void>;
}

export const CAPTION_SERVICE = Symbol('CAPTION_SERVICE');
