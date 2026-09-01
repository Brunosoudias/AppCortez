/**
 * Tipos preparados para a V2 (transcrição via Whisper local).
 */
export interface TranscriptSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  /** Confiança do reconhecimento de fala (0-1), quando disponível */
  confidence?: number;
}

export interface Transcript {
  projectId: string;
  language?: string;
  segments: TranscriptSegment[];
  /** Origem da transcrição */
  source?: 'openai' | 'whisper-cli' | 'ffmpeg-whisper' | 'heuristic';
  createdAt: string;
}
