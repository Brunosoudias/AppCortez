import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { readFile, unlink } from 'fs/promises';
import { join } from 'path';
import OpenAI from 'openai';
import type { Transcript, TranscriptSegment } from '@ai-video-cutter/shared-types';
import { generateId } from '@ai-video-cutter/shared-utils';
import { createReadStream } from 'fs';
import type { TranscriptionService, TranscribeRequestOptions } from '../interfaces/transcription-service.interface';
import { FfmpegService } from './ffmpeg.service';
import { StorageService } from '../../../common/storage/storage.service';

/**
 * Transcrição: OpenAI Whisper API → FFmpeg whisper.cpp local → CLI whisper → heurística.
 */
@Injectable()
export class WhisperTranscriptionService implements TranscriptionService {
  private readonly logger = new Logger(WhisperTranscriptionService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly ffmpeg: FfmpegService,
    private readonly storage: StorageService,
  ) {}

  async transcribe(videoPath: string, options: TranscribeRequestOptions = {}): Promise<Transcript> {
    const projectId = options.projectId ?? 'unknown';
    const language = this.normalizeLanguage(
      options.language ?? this.config.get<string>('app.defaultLanguage') ?? 'pt-BR',
    );
    const mode = (options.mode ?? this.config.get<string>('app.whisperMode') ?? 'auto').toLowerCase();
    const apiKey = this.config.get<string>('app.openaiApiKey') ?? '';
    const cliPath = this.config.get<string>('app.whisperCliPath') ?? 'whisper';

    const wavPath = this.storage.resolveSafePath(
      this.storage.getTempDir(),
      `${projectId}-${generateId()}.wav`,
    );

    try {
      await this.ffmpeg.extractAudio({ inputPath: videoPath, outputPath: wavPath });

      if (mode === 'openai' || (mode === 'auto' && apiKey)) {
        if (!apiKey) {
          throw new BadRequestException('OPENAI_API_KEY não configurada no .env');
        }
        return await this.transcribeOpenAi(wavPath, projectId, language, apiKey);
      }

      if (mode === 'ffmpeg' || mode === 'auto') {
        try {
          return await this.transcribeFfmpegWhisper(wavPath, projectId, language);
        } catch (err) {
          if (mode === 'ffmpeg') throw err;
          this.logger.warn(`FFmpeg Whisper indisponível: ${(err as Error).message}`);
        }
      }

      if (mode === 'cli' || mode === 'auto') {
        try {
          return await this.transcribeCli(wavPath, projectId, language, cliPath);
        } catch (err) {
          if (mode === 'cli') throw err;
          this.logger.warn(`Whisper CLI indisponível: ${(err as Error).message}`);
        }
      }

      if (mode === 'heuristic' || mode === 'auto') {
        this.logger.warn(
          'Usando transcrição heurística (sem texto real). Coloque ggml-base.bin em storage/models ou configure OPENAI_API_KEY.',
        );
        return this.transcribeHeuristic(videoPath, projectId, language);
      }

      throw new BadRequestException(
        'Nenhum motor de transcrição disponível. Baixe o modelo Whisper (storage/models/ggml-base.bin) ou configure OPENAI_API_KEY.',
      );
    } finally {
      await unlink(wavPath).catch(() => undefined);
    }
  }

  private resolveWhisperModelPath(): string {
    const configured = (this.config.get<string>('app.whisperModelPath') ?? '').trim();
    if (configured && existsSync(configured)) return configured;
    const candidates = [
      join(this.storage.getStorageRoot(), 'models', 'ggml-base.bin'),
      join(this.storage.getStorageRoot(), 'models', 'ggml-small.bin'),
      join(this.storage.getStorageRoot(), 'models', 'ggml-tiny.bin'),
    ];
    const found = candidates.find((p) => existsSync(p));
    if (!found) {
      throw new Error(
        `Modelo Whisper não encontrado. Salve ggml-base.bin em ${join(this.storage.getStorageRoot(), 'models')}`,
      );
    }
    return found;
  }

  private async transcribeFfmpegWhisper(
    wavPath: string,
    projectId: string,
    language: string,
  ): Promise<Transcript> {
    const modelPath = this.resolveWhisperModelPath();
    const srtPath = this.storage.resolveSafePath(
      this.storage.getTempDir(),
      `${projectId}-${generateId()}.srt`,
    );

    this.logger.log(`Transcrevendo com FFmpeg Whisper (${language})…`);
    await this.ffmpeg.transcribeWithWhisper({
      wavPath,
      modelPath,
      language,
      srtOutPath: srtPath,
    });

    const raw = await readFile(srtPath, 'utf-8');
    await unlink(srtPath).catch(() => undefined);
    const segments = this.parseSrt(raw);
    if (!segments.length) {
      throw new Error('Whisper não retornou segmentos de fala');
    }

    return {
      projectId,
      language,
      segments,
      source: 'ffmpeg-whisper',
      createdAt: new Date().toISOString(),
    };
  }

  private parseSrt(content: string): TranscriptSegment[] {
    const blocks = content.replace(/\r\n/g, '\n').split(/\n\s*\n/);
    const segments: TranscriptSegment[] = [];

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 2) continue;
      const timeLine = lines.find((l) => l.includes('-->'));
      if (!timeLine) continue;
      const [startRaw, endRaw] = timeLine.split('-->').map((s) => s.trim());
      const start = this.srtTimeToSeconds(startRaw);
      const end = this.srtTimeToSeconds(endRaw);
      if (start == null || end == null) continue;
      const text = lines
        .slice(lines.indexOf(timeLine) + 1)
        .join(' ')
        .replace(/<[^>]+>/g, '')
        .trim();
      if (!text || /^\[.*\]$/.test(text)) {
        // Mantém [MÚSICA] etc. se for o único conteúdo útil curto — mas evita placeholders nossos
        if (!text) continue;
      }
      segments.push({
        id: generateId(),
        start,
        end: Math.max(end, start + 0.05),
        text,
      });
    }

    return segments;
  }

  private srtTimeToSeconds(value: string): number | null {
    // 00:00:01,500 or 00:00:01.500
    const m = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/.exec(value);
    if (!m) return null;
    const ms = Number((m[4] + '000').slice(0, 3));
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + ms / 1000;
  }

  private async transcribeOpenAi(
    wavPath: string,
    projectId: string,
    language: string,
    apiKey: string,
  ): Promise<Transcript> {
    const client = new OpenAI({ apiKey });
    const result = await client.audio.transcriptions.create({
      file: createReadStream(wavPath),
      model: 'whisper-1',
      response_format: 'verbose_json',
      language: language === 'auto' ? undefined : language,
    });

    const segments: TranscriptSegment[] = (result.segments ?? []).map((seg: any) => ({
      id: generateId(),
      start: Number(seg.start) || 0,
      end: Number(seg.end) || 0,
      text: String(seg.text ?? '').trim(),
      confidence: typeof seg.avg_logprob === 'number' ? Math.min(1, Math.max(0, 1 + seg.avg_logprob / 5)) : undefined,
    })).filter((s) => s.text.length > 0);

    // Fallback se a API não devolver segments
    if (segments.length === 0 && result.text) {
      const info = await this.ffmpeg.getVideoInfo(wavPath).catch(() => ({ duration: 0 } as any));
      segments.push({
        id: generateId(),
        start: 0,
        end: info.duration || 0,
        text: result.text.trim(),
      });
    }

    return {
      projectId,
      language: result.language ?? language,
      segments,
      source: 'openai',
      createdAt: new Date().toISOString(),
    };
  }

  private async transcribeCli(
    wavPath: string,
    projectId: string,
    language: string,
    cliPath: string,
  ): Promise<Transcript> {
    const outDir = this.storage.getTempDir();
    const args = [
      wavPath,
      '--model',
      'base',
      '--output_format',
      'json',
      '--output_dir',
      outDir,
      '--verbose',
      'False',
    ];
    if (language && language !== 'auto') {
      args.push('--language', language);
    }

    await this.runCli(cliPath, args);

    // whisper salva <basename>.json
    const base = wavPath.replace(/\.[^.]+$/, '');
    const jsonPath = `${base}.json`;
    let raw: string;
    try {
      raw = await readFile(jsonPath, 'utf-8');
    } catch {
      // tenta só o nome do arquivo no outDir
      const name = wavPath.split(/[/\\]/).pop()!.replace(/\.[^.]+$/, '');
      raw = await readFile(join(outDir, `${name}.json`), 'utf-8');
    }

    const parsed = JSON.parse(raw) as { segments?: Array<{ start: number; end: number; text: string }>; text?: string };
    const segments: TranscriptSegment[] = (parsed.segments ?? []).map((seg) => ({
      id: generateId(),
      start: Number(seg.start) || 0,
      end: Number(seg.end) || 0,
      text: String(seg.text ?? '').trim(),
    })).filter((s) => s.text.length > 0);

    await unlink(jsonPath).catch(() => undefined);

    return {
      projectId,
      language,
      segments,
      source: 'whisper-cli',
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Fallback: divide o vídeo em janelas ~8s usando a duração (sem texto real).
   * Útil para desenvolver o restante do pipeline offline; a UI marca a origem.
   */
  private async transcribeHeuristic(videoPath: string, projectId: string, language: string): Promise<Transcript> {
    const info = await this.ffmpeg.getVideoInfo(videoPath);
    const duration = info.duration || 60;
    const window = 8;
    const segments: TranscriptSegment[] = [];

    for (let t = 0; t < duration; t += window) {
      const end = Math.min(duration, t + window);
      const idx = segments.length + 1;
      segments.push({
        id: generateId(),
        start: Number(t.toFixed(2)),
        end: Number(end.toFixed(2)),
        text: `[Segmento ${idx}] Trecho ${t.toFixed(0)}s–${end.toFixed(0)}s — sem fala reconhecida (falta modelo Whisper ou OPENAI_API_KEY).`,
        confidence: 0.1,
      });
    }

    return {
      projectId,
      language,
      segments,
      source: 'heuristic',
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Whisper (OpenAI/CLI) usa ISO-639-1. Aceitamos pt-BR / pt_BR e normalizamos para `pt`.
   */
  private normalizeLanguage(language: string): string {
    const raw = (language || 'pt').trim().toLowerCase().replace('_', '-');
    if (!raw || raw === 'auto') return raw || 'pt';
    if (raw.startsWith('pt')) return 'pt';
    return raw.split('-')[0] || 'pt';
  }

  private runCli(binary: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(binary, args, { shell: false });
      let stderr = '';
      child.stderr.on('data', (c) => {
        stderr += c.toString();
      });
      child.on('error', (err) => reject(new Error(`whisper CLI não encontrado: ${err.message}`)));
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr.slice(-500) || `whisper exit ${code}`));
      });
    });
  }
}
