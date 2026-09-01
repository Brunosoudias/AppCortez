export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  format: string;
}

export type AspectRatioKey = '16:9' | '9:16' | '1:1';

export interface VideoFormat {
  width: number;
  height: number;
  aspectRatio: AspectRatioKey;
}

/**
 * Presets de resolução usados para reenquadramento (V2).
 * 16:9  → horizontal (padrão de origem)
 * 9:16  → vertical (Shorts / Reels / TikTok)
 * 1:1   → quadrado (feed)
 */
export const VIDEO_FORMATS: Record<AspectRatioKey, VideoFormat> = {
  '16:9': { width: 1920, height: 1080, aspectRatio: '16:9' },
  '9:16': { width: 1080, height: 1920, aspectRatio: '9:16' },
  '1:1': { width: 1080, height: 1080, aspectRatio: '1:1' },
};
