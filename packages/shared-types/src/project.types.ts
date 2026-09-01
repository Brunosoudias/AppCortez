export type ProjectSourceType = 'url' | 'upload';

export type ProjectStatus =
  | 'created'
  | 'downloading'
  | 'processing'
  | 'analyzing'
  | 'completed'
  | 'failed';

export interface Project {
  id: string;
  name: string;
  sourceType: ProjectSourceType;
  sourceUrl?: string;
  /** Nome do arquivo original dentro de storage/projects/{id}/ (ex: "original.mp4") */
  originalFile?: string;
  /** Nome do arquivo de thumbnail dentro de storage/projects/{id}/ (ex: "thumbnail.jpg") */
  thumbnailFile?: string;
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
  status: ProjectStatus;
  /** Mensagem de erro quando status === 'failed' */
  errorMessage?: string;
  /** Nome do arquivo de transcrição (ex: transcript.json) */
  transcriptFile?: string;
  /** Resumo da última análise de IA */
  analysisSummary?: string;
  createdAt: string;
  updatedAt: string;
}
