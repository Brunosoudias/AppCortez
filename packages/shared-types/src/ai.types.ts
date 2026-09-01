import type { TranscriptSegment } from './transcript.types';
import type { ClipAspectRatio } from './clip.types';

export interface FindBestMomentsInput {
  transcript: TranscriptSegment[];
  duration: number;
  /** Quantidade máxima de momentos (default 8) */
  maxMoments?: number;
  /** Duração de referência (não fixa) — os cortes variam conforme o contexto da fala (12–90s). */
  targetDuration?: number;
  preferredFormat?: ClipAspectRatio;
}

export interface BestMoment {
  startTime: number;
  endTime: number;
  /** Pontuação 0-100 */
  score: number;
  reason: string;
  title?: string;
}

export interface TranscriptAnalysis {
  summary: string;
  topics: string[];
  highlights: BestMoment[];
  source?: 'openai' | 'heuristic';
}
