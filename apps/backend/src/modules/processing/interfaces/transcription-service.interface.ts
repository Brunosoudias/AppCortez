import type { Transcript } from '@ai-video-cutter/shared-types';

export interface TranscribeRequestOptions {
  projectId?: string;
  language?: string;
  mode?: string;
}

/**
 * Contrato do serviço de transcrição (Whisper API / CLI / heurística).
 */
export interface TranscriptionService {
  transcribe(videoPath: string, options?: TranscribeRequestOptions): Promise<Transcript>;
}

export const TRANSCRIPTION_SERVICE = Symbol('TRANSCRIPTION_SERVICE');
