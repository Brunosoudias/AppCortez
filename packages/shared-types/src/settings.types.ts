import type { ClipAspectRatio } from './clip.types';
import type { CaptionStyle } from './caption.types';

export type WhisperMode = 'auto' | 'openai' | 'ffmpeg' | 'cli' | 'heuristic';

export interface AppSettings {
  /** Idioma preferido para Whisper (ex: pt, en, auto) */
  language: string;
  whisperMode: WhisperMode;
  whisperCliPath: string;
  defaultClipFormat: ClipAspectRatio;
  /** Duração de referência para cortes automáticos (não fixa; o corte segue o contexto da fala). */
  defaultClipDuration: number;
  maxAutoClips: number;
  faceTrackingEnabled: boolean;
  /** Burn-in de legendas no render automático */
  burnCaptionsByDefault: boolean;
  /** Estilo ASS padrão */
  captionStyle: CaptionStyle;
  openaiConfigured: boolean;
  ytDlpPath: string;
  ffmpegPath: string;
  ffprobePath: string;
}

export interface UpdateAppSettingsPayload {
  language?: string;
  whisperMode?: WhisperMode;
  whisperCliPath?: string;
  defaultClipFormat?: ClipAspectRatio;
  defaultClipDuration?: number;
  maxAutoClips?: number;
  faceTrackingEnabled?: boolean;
  burnCaptionsByDefault?: boolean;
  captionStyle?: CaptionStyle;
}
