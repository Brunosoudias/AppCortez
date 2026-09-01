import { resolve } from 'path';

export interface AppConfig {
  port: number;
  storagePath: string;
  ffmpegPath: string;
  ffprobePath: string;
  ytDlpPath: string;
  /** Navegador para cookies (chrome|edge|firefox). Vazio = auto. */
  ytDlpBrowser: string;
  /** Arquivo cookies.txt Netscape (opcional, melhor para age-gate). */
  ytDlpCookiesFile: string;
  maxUploadSizeMb: number;
  frontendUrl: string;
  openaiApiKey: string;
  whisperCliPath: string;
  whisperMode: string;
  whisperModelPath: string;
  defaultLanguage: string;
}

export interface Configuration {
  app: AppConfig;
}

export default (): Configuration => ({
  app: {
    port: parseInt(process.env.PORT ?? '3333', 10),
    storagePath: resolve(process.cwd(), process.env.STORAGE_PATH ?? '../../storage'),
    ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',
    ffprobePath: process.env.FFPROBE_PATH ?? 'ffprobe',
    ytDlpPath: process.env.YT_DLP_PATH ?? 'yt-dlp',
    ytDlpBrowser: process.env.YT_DLP_BROWSER ?? '',
    ytDlpCookiesFile: process.env.YT_DLP_COOKIES_FILE ?? '',
    maxUploadSizeMb: parseInt(process.env.MAX_UPLOAD_SIZE_MB ?? '2048', 10),
    frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3030',
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
    whisperCliPath: process.env.WHISPER_CLI_PATH ?? 'whisper',
    whisperMode: process.env.WHISPER_MODE ?? 'auto',
    whisperModelPath: process.env.WHISPER_MODEL_PATH ?? '',
    defaultLanguage: process.env.DEFAULT_LANGUAGE ?? 'pt-BR',
  },
});
