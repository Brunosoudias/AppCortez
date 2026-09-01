import type { ProjectSourceType } from './project.types';
import type { ClipAspectRatio, ClipLayout } from './clip.types';

/** Payloads compartilhados entre o api client do frontend e os DTOs do backend */

export interface CreateProjectPayload {
  name: string;
  sourceType: ProjectSourceType;
  sourceUrl?: string;
}

export interface CreateClipPayload {
  startTime: number;
  endTime: number;
  format?: ClipAspectRatio;
  layout?: ClipLayout;
  title?: string;
  titleCta?: string;
  score?: number;
  reason?: string;
  cropCenterX?: number;
  cropCenterXBottom?: number;
}

export interface AutoClipsPayload {
  maxMoments?: number;
  targetDuration?: number;
  format?: ClipAspectRatio;
  layout?: ClipLayout;
  /** Renderiza o MP4 após criar o corte */
  render?: boolean;
  /** Queima legendas no MP4 (padrão: settings.burnCaptionsByDefault) */
  burnCaptions?: boolean;
}

export interface BurnCaptionsPayload {
  style?: 'srt' | 'ass';
}

export interface ApiErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
}
