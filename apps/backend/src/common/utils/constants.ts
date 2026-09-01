/** Extensões de vídeo aceitas para upload e leitura pelo FFmpeg. */
export const ALLOWED_VIDEO_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.webm', '.avi'] as const;

/** Mimetypes aceitos para upload (validação best-effort — o navegador/cliente informa). */
export const ALLOWED_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-matroska',
  'video/webm',
  'video/x-msvideo',
] as const;

export const THUMBNAIL_FILENAME = 'thumbnail.jpg';
export const PROJECT_METADATA_FILENAME = 'project.json';
export const CLIPS_METADATA_FILENAME = 'clips.json';
export const TRANSCRIPT_FILENAME = 'transcript.json';
export const ANALYSIS_FILENAME = 'analysis.json';
export const CAPTIONS_SRT_FILENAME = 'captions.srt';
export const CAPTIONS_ASS_FILENAME = 'captions.ass';
export const SETTINGS_FILENAME = 'settings.json';
export const JOBS_FILENAME = 'jobs.json';
