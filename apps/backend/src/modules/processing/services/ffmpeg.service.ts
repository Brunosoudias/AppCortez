import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn, type ChildProcess } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { join, dirname } from 'path';
import type { ClipAspectRatio, ClipLayout, VideoInfo } from '@ai-video-cutter/shared-types';
import { VIDEO_FORMATS } from '@ai-video-cutter/shared-types';

export interface CutVideoOptions {
  inputPath: string;
  outputPath: string;
  startTime: number;
  endTime: number;
  onProgress?: (percent: number) => void;
}

export interface CutAndFitOptions extends CutVideoOptions {
  format: ClipAspectRatio;
  /**
   * Centro horizontal relativo (0–1) para crop vertical/quadrado.
   * 0.5 = centro (default). Usado quando não há trackExpression.
   */
  cropCenterX?: number;
  /**
   * Expressão FFmpeg (já com vírgulas escapadas) para o centro X ao longo do tempo.
   * Ex.: if(lt(t\,1.0)\,0.3\,0.5)
   */
  cropXExpression?: string;
  /**
   * `crop`  = um enquadramento 9:16.
   * `stack` = dois painéis de vídeo empilhados (podcast).
   * `title` = vídeo em cima + painel de texto/descrição embaixo.
   */
  layout?: ClipLayout;
  /** Centro X do painel inferior no layout stack (0–1). */
  cropCenterXBottom?: number;
  /** Expressão dinâmica do painel inferior (outro interlocutor). */
  cropXExpressionBottom?: string;
  /** Texto do painel inferior (layout title). */
  titleText?: string;
  /** CTA pequeno sob o título (layout title). */
  titleCta?: string;
  /** Permite matar o FFmpeg deste render (ex.: id do corte). */
  abortKey?: string;
}

export interface GenerateThumbnailOptions {
  inputPath: string;
  outputPath: string;
  /** Segundo do vídeo de onde extrair o frame. Default: 1. */
  timestamp?: number;
}

export interface ExtractAudioOptions {
  inputPath: string;
  outputPath: string;
  onProgress?: (percent: number) => void;
}

export interface GenerateCaptionsOptions {
  videoPath: string;
  subtitlePath: string;
  outputPath: string;
  onProgress?: (percent: number) => void;
}

export interface ReframeOptions {
  inputPath: string;
  outputPath: string;
  format: ClipAspectRatio;
  onProgress?: (percent: number) => void;
}

interface RunOptions {
  expectedDurationSec?: number;
  onProgress?: (percent: number) => void;
  cwd?: string;
  /** Chave para abortar o processo (ex.: clipId) */
  abortKey?: string;
}

interface RunResult {
  stdout: string;
  stderr: string;
}

/**
 * Única camada da aplicação que sabe falar com os binários do FFmpeg/FFprobe.
 * Nenhum controller ou outro service deve chamar `child_process` diretamente
 * — tudo passa por aqui, sempre com `spawn` e argumentos em array (nunca uma
 * string de shell montada por concatenação), para eliminar risco de command
 * injection mesmo que algum valor tenha se originado de input do usuário.
 */
@Injectable()
export class FfmpegService {
  private readonly logger = new Logger(FfmpegService.name);
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;
  private readonly activeProcesses = new Map<string, ChildProcess>();

  constructor(private readonly configService: ConfigService) {
    this.ffmpegPath = this.configService.get<string>('app.ffmpegPath')!;
    this.ffprobePath = this.configService.get<string>('app.ffprobePath')!;
  }

  /** Lê duração, dimensões, fps e formato de um arquivo de vídeo via ffprobe. */
  async getVideoInfo(filePath: string): Promise<VideoInfo> {
    const args = [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ];

    const { stdout } = await this.run(this.ffprobePath, args, 'ffprobe');

    let parsed: any;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      throw new InternalServerErrorException('Não foi possível ler as informações do vídeo');
    }

    const videoStream = (parsed.streams ?? []).find((s: any) => s.codec_type === 'video');
    if (!videoStream) {
      throw new InternalServerErrorException('Nenhum stream de vídeo encontrado no arquivo');
    }

    const duration = parseFloat(parsed.format?.duration ?? videoStream.duration ?? '0');
    const fps = this.parseFrameRate(videoStream.r_frame_rate);
    const format = (parsed.format?.format_name ?? 'unknown').split(',')[0];

    return {
      duration: Number.isFinite(duration) ? duration : 0,
      width: Number(videoStream.width) || 0,
      height: Number(videoStream.height) || 0,
      fps,
      format,
    };
  }

  /** Corta um trecho [startTime, endTime) de `inputPath` e salva em `outputPath`. */
  async cutVideo(options: CutVideoOptions): Promise<void> {
    const { inputPath, outputPath, startTime, endTime, onProgress } = options;
    const duration = endTime - startTime;

    const args = [
      '-y',
      '-ss',
      startTime.toFixed(3),
      '-i',
      inputPath,
      '-t',
      duration.toFixed(3),
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      '-preset',
      'veryfast',
      '-movflags',
      '+faststart',
      outputPath,
    ];

    await this.run(this.ffmpegPath, args, 'ffmpeg', {
      expectedDurationSec: duration,
      onProgress,
    });
  }

  /**
   * Corta o trecho e reenquadra para o formato pedido (16:9 / 9:16 / 1:1).
   * Com `cropXExpression`, o enquadramento acompanha o tracking ao longo do tempo.
   */
  async cutAndFit(options: CutAndFitOptions): Promise<void> {
    const {
      inputPath,
      outputPath,
      startTime,
      endTime,
      format,
      onProgress,
      cropCenterX = 0.5,
      cropXExpression,
      layout = format === '9:16' ? 'stack' : 'crop',
      cropCenterXBottom,
      cropXExpressionBottom,
      titleText,
      titleCta,
      abortKey,
    } = options;
    const duration = endTime - startTime;
    const target = VIDEO_FORMATS[format];
    const cx = Math.min(1, Math.max(0, cropCenterX));
    const xPart = cropXExpression ?? cx.toFixed(4);

    let filterArgs: string[];
    let titleTextPath: string | undefined;

    if (layout === 'stack' && format === '9:16') {
      // Dois painéis 1080x960 (horizontal) empilhados → 1080x1920
      const halfW = target.width;
      const halfH = Math.floor(target.height / 2);
      const topX = xPart;
      const botCx =
        typeof cropCenterXBottom === 'number'
          ? Math.min(1, Math.max(0, cropCenterXBottom))
          : Math.min(1, Math.max(0, cx + 0.2));
      const botX = cropXExpressionBottom ?? botCx.toFixed(4);
      const fc =
        `[0:v]split=2[vtop][vbot];` +
        `[vtop]scale=${halfW}:${halfH}:force_original_aspect_ratio=increase,` +
        `crop=${halfW}:${halfH}:(iw-${halfW})*(${topX}):(ih-${halfH})*0.28[top];` +
        `[vbot]scale=${halfW}:${halfH}:force_original_aspect_ratio=increase,` +
        `crop=${halfW}:${halfH}:(iw-${halfW})*(${botX}):(ih-${halfH})*0.55[bot];` +
        `[top][bot]vstack=inputs=2[vout]`;
      filterArgs = ['-filter_complex', fc, '-map', '[vout]', '-map', '0:a?'];
    } else if (layout === 'title' && format === '9:16') {
      // Vídeo em cima (~50%) + painel escuro com título/descrição embaixo (pad + ASS)
      const halfW = target.width;
      const halfH = Math.floor(target.height / 2);
      const headline = (titleText?.trim() || 'ASSISTA ATÉ O FINAL').toUpperCase();
      const cta = (titleCta?.trim() || 'DESLIZE PARA SABER MAIS').toUpperCase();
      const wrapped = wrapTitleLines(headline, 22).replace(/\n/g, '\\N');
      const assPath = join(dirname(outputPath), `_title_${Date.now()}.ass`);
      titleTextPath = assPath;

      const titleY = halfH + Math.floor((target.height - halfH) / 2) - 24;
      const ctaY = target.height - 72;
      const ass = `[Script Info]
Title: Clip Title Panel
ScriptType: v4.00+
PlayResX: ${halfW}
PlayResY: ${target.height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Title,Arial Black,62,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,5,50,50,0,1
Style: Cta,Arial,26,&H00BBBBBB,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,40,40,70,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,9:59:59.00,Title,,0,0,0,,{\\pos(${Math.floor(halfW / 2)},${titleY})}${escapeAssText(wrapped)}
Dialogue: 0,0:00:00.00,9:59:59.00,Cta,,0,0,0,,{\\pos(${Math.floor(halfW / 2)},${ctaY})}${escapeAssText(cta)}
`;
      await writeFile(assPath, ass, 'utf-8');
      const assEsc = this.escapeSubtitlesPath(assPath);

      // pad preenche a metade inferior com preto; drawbox traça a linha branca
      const fc =
        `[0:v]scale=${halfW}:${halfH}:force_original_aspect_ratio=increase,` +
        `crop=${halfW}:${halfH}:(iw-${halfW})*(${xPart}):(ih-${halfH})*0.28,` +
        `pad=${halfW}:${target.height}:0:0:0x0B0B0B,` +
        `drawbox=x=0:y=${halfH}:w=${halfW}:h=3:color=white:t=fill[base];` +
        `[base]ass='${assEsc}'[vout]`;

      filterArgs = ['-filter_complex', fc, '-map', '[vout]', '-map', '0:a?'];
    } else {
      const vf = `scale=${target.width}:${target.height}:force_original_aspect_ratio=increase,crop=${target.width}:${target.height}:(iw-${target.width})*(${xPart}):(ih-${target.height})/2`;
      filterArgs = ['-vf', vf];
    }

    const args = [
      '-y',
      '-ss',
      startTime.toFixed(3),
      '-i',
      inputPath,
      '-t',
      duration.toFixed(3),
      ...filterArgs,
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      '-preset',
      'veryfast',
      '-movflags',
      '+faststart',
      outputPath,
    ];

    try {
      await this.run(this.ffmpegPath, args, 'ffmpeg', {
        expectedDurationSec: duration,
        onProgress,
        abortKey,
      });
    } finally {
      if (titleTextPath) {
        await unlink(titleTextPath).catch(() => undefined);
      }
    }
  }

  /** Extrai um frame do vídeo como thumbnail JPEG. */
  async generateThumbnail(options: GenerateThumbnailOptions): Promise<void> {
    const { inputPath, outputPath, timestamp = 1 } = options;

    const args = [
      '-y',
      '-ss',
      timestamp.toFixed(3),
      '-i',
      inputPath,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      outputPath,
    ];

    await this.run(this.ffmpegPath, args, 'ffmpeg');
  }

  /** Extrai áudio em WAV 16 kHz mono (pronto para Whisper na V2). */
  async extractAudio(options: ExtractAudioOptions): Promise<void> {
    const { inputPath, outputPath, onProgress } = options;
    let expectedDurationSec: number | undefined;
    try {
      const info = await this.getVideoInfo(inputPath);
      expectedDurationSec = info.duration;
    } catch {
      // progresso fica indeterminado se o probe falhar
    }

    const args = [
      '-y',
      '-i',
      inputPath,
      '-vn',
      '-acodec',
      'pcm_s16le',
      '-ar',
      '16000',
      '-ac',
      '1',
      outputPath,
    ];

    await this.run(this.ffmpegPath, args, 'ffmpeg', { expectedDurationSec, onProgress });
  }

  /** Queima legendas (SRT/ASS) no vídeo. No Windows usa cwd + nome relativo (drive `D:` quebra o filtro). */
  async generateCaptions(options: GenerateCaptionsOptions): Promise<void> {
    const { videoPath, subtitlePath, outputPath, onProgress } = options;
    let expectedDurationSec: number | undefined;
    try {
      const info = await this.getVideoInfo(videoPath);
      expectedDurationSec = info.duration;
    } catch {
      // ignore
    }

    const { dirname, basename, resolve } = await import('path');
    const { copyFile } = await import('fs/promises');
    const workDir = dirname(resolve(subtitlePath));
    const subName = basename(subtitlePath);
    const outName = `_captioned_${Date.now()}.mp4`;
    const workOut = resolve(workDir, outName);

    // Garante que o arquivo de legenda está no workDir com nome simples
    const workSub = resolve(workDir, subName);
    if (resolve(subtitlePath) !== workSub) {
      await copyFile(subtitlePath, workSub);
    }

    const args = [
      '-y',
      '-i',
      resolve(videoPath),
      '-vf',
      `subtitles=${subName}`,
      '-c:v',
      'libx264',
      '-c:a',
      'copy',
      '-preset',
      'veryfast',
      '-movflags',
      '+faststart',
      workOut,
    ];

    await this.run(this.ffmpegPath, args, 'ffmpeg', {
      expectedDurationSec,
      onProgress,
      cwd: workDir,
    });

    const { copyFile: copyOut, unlink } = await import('fs/promises');
    const finalOut = resolve(outputPath);
    if (workOut !== finalOut) {
      await copyOut(workOut, finalOut);
      await unlink(workOut).catch(() => undefined);
    }
  }

  /**
   * Transcreve áudio WAV via filtro whisper do FFmpeg (whisper.cpp).
   * Usa caminhos relativos + cwd para evitar o bug do `:` no Windows.
   */
  async transcribeWithWhisper(options: {
    wavPath: string;
    modelPath: string;
    language: string;
    srtOutPath: string;
  }): Promise<void> {
    const { dirname, basename, resolve, relative } = await import('path');
    const workDir = dirname(resolve(options.wavPath));
    const wavName = basename(options.wavPath);
    const srtName = basename(options.srtOutPath);
    const modelAbs = resolve(options.modelPath);
    let modelRel = relative(workDir, modelAbs).replace(/\\/g, '/');
    if (!modelRel || modelRel.startsWith('..') === false && modelRel.includes(':')) {
      modelRel = modelAbs.replace(/\\/g, '/');
    }
    // Se ainda tiver drive letter, copia referência via path relativo forçado
    if (/^[A-Za-z]:/.test(modelRel)) {
      modelRel = relative(workDir, modelAbs).replace(/\\/g, '/');
    }

    const lang = options.language === 'auto' ? 'auto' : options.language;
    const filter = `whisper=model=${modelRel}:language=${lang}:format=srt:destination=${srtName}`;

    await this.run(
      this.ffmpegPath,
      ['-y', '-i', wavName, '-af', filter, '-f', 'null', '-'],
      'ffmpeg-whisper',
      { cwd: workDir },
    );

    const { rename, access } = await import('fs/promises');
    const produced = resolve(workDir, srtName);
    const dest = resolve(options.srtOutPath);
    if (produced !== dest) {
      try {
        await access(produced);
        await rename(produced, dest);
      } catch {
        // destination pode já ser o caminho final
      }
    }
  }

  /** Reenquadra o vídeo inteiro para 9:16 (crop central). */
  async renderVerticalVideo(inputPath: string, outputPath: string, onProgress?: (p: number) => void): Promise<void> {
    await this.reframe({ inputPath, outputPath, format: '9:16', onProgress });
  }

  /** Reenquadra o vídeo inteiro para 16:9 (crop central). */
  async renderHorizontalVideo(inputPath: string, outputPath: string, onProgress?: (p: number) => void): Promise<void> {
    await this.reframe({ inputPath, outputPath, format: '16:9', onProgress });
  }

  private async reframe(options: ReframeOptions): Promise<void> {
    const { inputPath, outputPath, format, onProgress } = options;
    const target = VIDEO_FORMATS[format];
    let expectedDurationSec: number | undefined;
    try {
      const info = await this.getVideoInfo(inputPath);
      expectedDurationSec = info.duration;
    } catch {
      // ignore
    }

    const vf = `scale=${target.width}:${target.height}:force_original_aspect_ratio=increase,crop=${target.width}:${target.height}`;
    const args = [
      '-y',
      '-i',
      inputPath,
      '-vf',
      vf,
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      '-preset',
      'veryfast',
      '-movflags',
      '+faststart',
      outputPath,
    ];

    await this.run(this.ffmpegPath, args, 'ffmpeg', { expectedDurationSec, onProgress });
  }

  /** Escapa caminho para o filtro `subtitles=` do FFmpeg (Windows-safe). */
  private escapeSubtitlesPath(filePath: string): string {
    return filePath
      .replace(/\\/g, '/')
      .replace(/:/g, '\\:')
      .replace(/'/g, "\\'")
      .replace(/\[/g, '\\[')
      .replace(/]/g, '\\]');
  }

  private parseFrameRate(rFrameRate: string | undefined): number {
    if (!rFrameRate) return 0;
    const [num, den] = rFrameRate.split('/').map(Number);
    if (!den) return num || 0;
    return Math.round((num / den) * 100) / 100;
  }

  private parseTimeToSeconds(timeStr: string): number | null {
    // HH:MM:SS.xx ou MM:SS.xx
    const parts = timeStr.split(':').map(Number);
    if (parts.some((n) => Number.isNaN(n))) return null;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return null;
  }

  /**
   * Executa um binário externo com argumentos passados como array — nunca
   * via shell — e rejeita com uma mensagem segura (sem stderr cru) caso o
   * processo termine com código de saída diferente de zero ou não seja
   * encontrado.
   */
  /** Interrompe um FFmpeg em andamento registrado com `abortKey`. */
  abort(abortKey: string): boolean {
    const child = this.activeProcesses.get(abortKey);
    if (!child) return false;
    try {
      child.kill('SIGKILL');
    } catch {
      // ignore
    }
    this.activeProcesses.delete(abortKey);
    this.logger.warn(`FFmpeg abortado: ${abortKey}`);
    return true;
  }

  private run(binary: string, args: string[], label: string, options: RunOptions = {}): Promise<RunResult> {
    const { expectedDurationSec, onProgress, cwd, abortKey } = options;

    return new Promise((resolvePromise, reject) => {
      const child = spawn(binary, args, { shell: false, cwd });
      if (abortKey) {
        this.activeProcesses.set(abortKey, child);
      }

      let stdout = '';
      let stderr = '';
      let lastReported = -1;
      let aborted = false;

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        stderr += text;

        if (onProgress && expectedDurationSec && expectedDurationSec > 0) {
          const match = /time=(\d{1,2}:\d{2}:\d{2}\.\d+)/.exec(text);
          if (match) {
            const current = this.parseTimeToSeconds(match[1]);
            if (current != null) {
              const percent = Math.min(99, Math.max(0, Math.round((current / expectedDurationSec) * 100)));
              if (percent !== lastReported) {
                lastReported = percent;
                onProgress(percent);
              }
            }
          }
        }
      });

      child.on('error', (err) => {
        if (abortKey) this.activeProcesses.delete(abortKey);
        this.logger.error(`Falha ao executar ${label} (${binary}): ${err.message}`);
        reject(
          new InternalServerErrorException(
            `${label} não encontrado. Verifique se está instalado e configurado em FFMPEG_PATH/FFPROBE_PATH.`,
          ),
        );
      });

      child.on('close', (code, signal) => {
        if (abortKey) this.activeProcesses.delete(abortKey);
        if (aborted || signal === 'SIGKILL' || signal === 'SIGTERM') {
          reject(new Error('Processo cancelado'));
          return;
        }
        if (code === 0) {
          onProgress?.(100);
          resolvePromise({ stdout, stderr });
          return;
        }
        this.logger.error(`${label} saiu com código ${code}\n${stderr.slice(-2000)}`);
        reject(new InternalServerErrorException(`Falha ao processar vídeo (${label})`));
      });

      // marca aborted se kill veio via abort()
      const originalKill = child.kill.bind(child);
      child.kill = ((signal?: NodeJS.Signals | number) => {
        aborted = true;
        return originalKill(signal);
      }) as typeof child.kill;
    });
  }
}

/** Quebra o título em linhas curtas para o painel inferior. */
function wrapTitleLines(text: string, maxLen: number): string {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxLen && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 5).join('\n');
}

/** Escapa texto para diálogo ASS. */
function escapeAssText(text: string): string {
  return text.replace(/\{/g, '(').replace(/\}/g, ')').replace(/\n/g, '\\N');
}
