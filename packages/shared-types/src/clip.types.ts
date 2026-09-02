export type ClipAspectRatio = '16:9' | '9:16' | '1:1';

/**
 * Layout do render vertical (9:16):
 * - crop  → um enquadramento preenchendo a tela
 * - stack → dois painéis de vídeo (ex.: podcast com 2 pessoas)
 * - title → vídeo em cima + painel de texto/descrição embaixo (estilo Reels)
 * - blur  → vídeo centralizado com fundo desfocado em cima e embaixo (estilo YouTube Shorts / OpusClip)
 */
export type ClipLayout = 'crop' | 'stack' | 'title' | 'blur';

export const CLIP_LAYOUT_LABELS: Record<ClipLayout, string> = {
  crop: '9:16 completo',
  stack: 'Dois painéis',
  title: 'Vídeo + texto',
  blur: 'Estilo Shorts',
};

export type ClipStatus = 'created' | 'processing' | 'completed' | 'failed';

export interface Clip {
  id: string;
  projectId: string;

  startTime: number;
  endTime: number;
  duration: number;

  /** Pontuação 0-100 atribuída pela IA (V2) indicando o quão bom é o momento */
  score?: number;

  title?: string;

  /** CTA opcional no painel de texto (layout title). Ex.: "DESLIZE PARA SABER MAIS" */
  titleCta?: string;

  /** Explicação da IA sobre por que este trecho foi escolhido (V2) */
  reason?: string;

  status: ClipStatus;

  format: ClipAspectRatio;

  /** Layout visual do MP4 vertical. Ignorado em 16:9 / 1:1 (sempre crop). */
  layout?: ClipLayout;

  /** Progresso de render 0–100 (atualizado durante o FFmpeg) */
  progress?: number;

  /** Nome do arquivo renderizado dentro de storage/projects/{projectId}/clips/ */
  outputFile?: string;

  /** Arquivo de legendas associado (srt/ass), relativo ao projeto */
  captionsFile?: string;

  /** Centro horizontal do crop 0–1 (ajuste manual / face track). */
  cropCenterX?: number;

  /** Centro do painel inferior no layout stack (0–1). */
  cropCenterXBottom?: number;

  /**
   * Escala do vídeo central no layout blur (0.5–2.0).
   * 1.0 = largura do frame; valores maiores aumentam o vídeo nítido.
   */
  centerZoom?: number;

  /** Se true, o render deve queimar legendas */
  burnCaptions?: boolean;

  /** Mensagem de erro quando status === 'failed' */
  errorMessage?: string;

  createdAt: string;
  updatedAt: string;
}
