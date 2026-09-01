export type CaptionStyle = 'clean' | 'boxed' | 'reels' | 'karaoke';

export const CAPTION_STYLE_LABELS: Record<CaptionStyle, string> = {
  clean: 'Clean',
  boxed: 'Caixa',
  reels: 'Reels / Shorts',
  karaoke: 'Karaoke (palavra)',
};

export interface CaptionGenerateOptions {
  style?: CaptionStyle;
  /** Largura de referência do ASS (default 1080) */
  playResX?: number;
  /** Altura de referência do ASS (default 1920 para vertical) */
  playResY?: number;
}
