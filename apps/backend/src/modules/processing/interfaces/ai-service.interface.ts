import type {
  BestMoment,
  FindBestMomentsInput,
  TranscriptAnalysis,
  TranscriptSegment,
} from '@ai-video-cutter/shared-types';

/**
 * Contrato do serviço de IA. Implementado nesta versão apenas por um stub
 * (`StubAiService`) que lança NotImplementedException — a implementação real
 * (LLM local ou remoto) chega na V2.
 *
 * Uso futuro esperado:
 *   const clips = await aiService.findBestMoments({ transcript, duration });
 */
export interface AiService {
  analyzeTranscript(transcript: TranscriptSegment[]): Promise<TranscriptAnalysis>;
  findBestMoments(input: FindBestMomentsInput): Promise<BestMoment[]>;
  generateClipTitle(text: string, opts?: { startTime?: number; endTime?: number }): Promise<string>;
  calculateClipScore(segment: TranscriptSegment): Promise<number>;
}

export const AI_SERVICE = Symbol('AI_SERVICE');
