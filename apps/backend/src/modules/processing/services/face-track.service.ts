import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { mkdir, readFile, rm } from 'fs/promises';
import { join } from 'path';
import { StorageService } from '../../../common/storage/storage.service';

export interface FaceTrackPoint {
  time: number;
  /** Centro horizontal relativo 0–1 do falante ativo */
  x: number;
  /** Centro do outro sujeito (quando houver 2), para painel inferior */
  secondaryX?: number;
}

export interface FaceTrackResult {
  points: FaceTrackPoint[];
  smoothed: FaceTrackPoint[];
  /** Média suavizada (fallback estático) */
  averageX: number;
  averageSecondaryX: number;
  /** Expressão FFmpeg para crop x-fraction em função de t (relativo ao início do trecho) */
  cropXExpression: string;
  cropXExpressionSecondary: string;
}

interface FrameAnalysis {
  primaryX: number;
  secondaryX: number;
  activity: number;
}

/**
 * Tracking do falante: amostra frames, detecta 1–2 clusters de pele (rostos)
 * e escolhe quem tem mais movimento na região da boca (proxy de fala).
 */
@Injectable()
export class FaceTrackService {
  private readonly logger = new Logger(FaceTrackService.name);
  private readonly ffmpegPath: string;

  constructor(
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {
    this.ffmpegPath = this.config.get<string>('app.ffmpegPath')!;
  }

  async estimateCropCenterX(inputPath: string, startTime: number, endTime: number): Promise<number> {
    const result = await this.analyze(inputPath, startTime, endTime, 5);
    return result.averageX;
  }

  async analyze(
    inputPath: string,
    startTime: number,
    endTime: number,
    count = 12,
  ): Promise<FaceTrackResult> {
    const raw = await this.sampleSpeakerCenters(inputPath, startTime, endTime, count);
    const smoothed = this.smoothPoints(raw, 3);
    const averageX =
      smoothed.length === 0
        ? 0.5
        : Math.min(0.85, Math.max(0.15, smoothed.reduce((a, b) => a + b.x, 0) / smoothed.length));
    const secondaryVals = smoothed
      .map((p) => p.secondaryX)
      .filter((v): v is number => typeof v === 'number');
    const averageSecondaryX =
      secondaryVals.length === 0
        ? Math.min(0.9, averageX + 0.2)
        : Math.min(0.9, Math.max(0.1, secondaryVals.reduce((a, b) => a + b, 0) / secondaryVals.length));

    const relative = smoothed.map((p) => ({
      time: Math.max(0, p.time - startTime),
      x: p.x,
      secondaryX: p.secondaryX,
    }));

    return {
      points: raw,
      smoothed,
      averageX,
      averageSecondaryX,
      cropXExpression: this.buildCropXExpression(relative),
      cropXExpressionSecondary: this.buildCropXExpression(
        relative.map((p) => ({
          time: p.time,
          x: p.secondaryX ?? averageSecondaryX,
        })),
      ),
    };
  }

  async sampleTrack(inputPath: string, startTime: number, endTime: number, count = 8): Promise<FaceTrackPoint[]> {
    return this.sampleSpeakerCenters(inputPath, startTime, endTime, count);
  }

  smoothPoints(points: FaceTrackPoint[], window = 3): FaceTrackPoint[] {
    if (points.length <= 1) return points.map((p) => ({ ...p }));
    const half = Math.floor(window / 2);
    return points.map((p, i) => {
      let sum = 0;
      let sumSec = 0;
      let n = 0;
      let nSec = 0;
      for (let j = Math.max(0, i - half); j <= Math.min(points.length - 1, i + half); j++) {
        sum += points[j].x;
        n++;
        if (typeof points[j].secondaryX === 'number') {
          sumSec += points[j].secondaryX!;
          nSec++;
        }
      }
      return {
        time: p.time,
        x: Math.min(0.9, Math.max(0.1, sum / n)),
        secondaryX: nSec ? Math.min(0.9, Math.max(0.1, sumSec / nSec)) : p.secondaryX,
      };
    });
  }

  buildCropXExpression(points: FaceTrackPoint[]): string {
    if (!points.length) return '0.5';
    if (points.length === 1) return points[0].x.toFixed(4);

    let expr = points[points.length - 1].x.toFixed(4);
    for (let i = points.length - 2; i >= 0; i--) {
      const a = points[i];
      const b = points[i + 1];
      const dt = Math.max(0.001, b.time - a.time);
      const lerp = `${a.x.toFixed(4)}+(${(b.x - a.x).toFixed(4)})*(t-${a.time.toFixed(3)})/${dt.toFixed(3)}`;
      expr = `if(lt(t\\,${b.time.toFixed(3)})\\,${lerp}\\,${expr})`;
    }
    return expr;
  }

  private async sampleSpeakerCenters(
    inputPath: string,
    startTime: number,
    endTime: number,
    count: number,
  ): Promise<FaceTrackPoint[]> {
    const duration = Math.max(0.5, endTime - startTime);
    const samples = Math.max(4, Math.min(24, count));
    const tmpDir = this.storage.resolveSafePath(this.storage.getTempDir(), `faces-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });

    try {
      const points: FaceTrackPoint[] = [];
      let prevGray: Uint8Array | null = null;
      let prevWidth = 0;
      let prevHeight = 0;
      let stickyPrimary: number | null = null;

      for (let i = 0; i < samples; i++) {
        const t = startTime + (duration * (i + 0.5)) / samples;
        const framePath = join(tmpDir, `f${i}.ppm`);
        await this.extractPpmFrame(inputPath, t, framePath);
        const frame = await this.analyzeFrame(framePath, prevGray, prevWidth, prevHeight, stickyPrimary);
        stickyPrimary = frame.primaryX;
        points.push({
          time: t,
          x: frame.primaryX,
          secondaryX: frame.secondaryX,
        });

        const gray = await this.readGrayFromPpm(framePath);
        prevGray = gray.data;
        prevWidth = gray.width;
        prevHeight = gray.height;
      }

      this.logger.log(
        `FaceTrack ${samples} amostras · falante médio X=${(
          points.reduce((a, p) => a + p.x, 0) / Math.max(1, points.length)
        ).toFixed(3)}`,
      );
      return points;
    } catch (err) {
      this.logger.warn(`FaceTrack falhou: ${(err as Error).message}`);
      return [];
    } finally {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private extractPpmFrame(inputPath: string, timestamp: number, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-ss',
        timestamp.toFixed(3),
        '-i',
        inputPath,
        '-frames:v',
        '1',
        '-vf',
        'scale=240:-1',
        outputPath,
      ];
      const child = spawn(this.ffmpegPath, args, { shell: false });
      let stderr = '';
      child.stderr.on('data', (c) => {
        stderr += c.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr.slice(-300) || `ffmpeg frame exit ${code}`));
      });
    });
  }

  private async analyzeFrame(
    filePath: string,
    prevGray: Uint8Array | null,
    prevWidth: number,
    prevHeight: number,
    stickyPrimary: number | null,
  ): Promise<FrameAnalysis> {
    const buf = await readFile(filePath);
    const ppm = this.parsePpm(buf);
    if (!ppm) return { primaryX: stickyPrimary ?? 0.5, secondaryX: 0.7, activity: 0 };

    const { width, height, pixels } = ppm;
    const colScore = new Array(width).fill(0);
    let total = 0;

    // Peso maior na metade superior (rosto)
    for (let y = 0; y < height; y++) {
      const yWeight = y < height * 0.6 ? 2.5 : 0.6;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 3;
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        if (this.isSkin(r, g, b)) {
          colScore[x] += yWeight;
          total += yWeight;
        }
      }
    }

    if (total < width * 0.4) {
      return { primaryX: stickyPrimary ?? 0.5, secondaryX: Math.min(0.9, (stickyPrimary ?? 0.5) + 0.25), activity: 0 };
    }

    const clusters = this.findFaceClusters(colScore, width);
    if (!clusters.length) {
      return { primaryX: stickyPrimary ?? 0.5, secondaryX: 0.7, activity: 0 };
    }

    // Atividade (movimento) por cluster — proxy de quem está falando
    const scored = clusters.map((c) => {
      const activity =
        prevGray && prevWidth === width && prevHeight === height
          ? this.mouthMotion(pixels, prevGray, width, height, c.x, c.radius)
          : c.mass;
      return { ...c, activity };
    });

    scored.sort((a, b) => b.activity - a.activity);

    // Histerese: só troca de falante se o outro estiver claramente mais ativo
    let primary = scored[0];
    if (stickyPrimary != null && scored.length > 1) {
      const current = scored.reduce((best, c) =>
        Math.abs(c.x - stickyPrimary) < Math.abs(best.x - stickyPrimary) ? c : best,
      );
      const challenger = scored[0];
      if (Math.abs(challenger.x - current.x) > 0.12 && challenger.activity > current.activity * 1.35) {
        primary = challenger;
      } else {
        primary = current;
      }
    }

    const secondary =
      scored.find((c) => Math.abs(c.x - primary.x) > 0.12) ??
      ({ x: Math.min(0.9, Math.max(0.1, primary.x > 0.5 ? primary.x - 0.28 : primary.x + 0.28)), activity: 0, mass: 0, radius: 0.1 });

    return {
      primaryX: primary.x,
      secondaryX: secondary.x,
      activity: primary.activity,
    };
  }

  /** Encontra 1–2 picos no histograma de pele (dois interlocutores). */
  private findFaceClusters(
    colScore: number[],
    width: number,
  ): Array<{ x: number; mass: number; radius: number }> {
    const smoothed = colScore.map((_, i) => {
      let s = 0;
      let n = 0;
      for (let j = Math.max(0, i - 4); j <= Math.min(width - 1, i + 4); j++) {
        s += colScore[j];
        n++;
      }
      return s / n;
    });

    const max = Math.max(...smoothed, 1);
    const threshold = max * 0.35;
    const peaks: number[] = [];
    for (let i = 2; i < width - 2; i++) {
      if (
        smoothed[i] >= threshold &&
        smoothed[i] >= smoothed[i - 1] &&
        smoothed[i] >= smoothed[i + 1] &&
        smoothed[i] >= smoothed[i - 2] &&
        smoothed[i] >= smoothed[i + 2]
      ) {
        // Evita picos vizinhos
        if (!peaks.some((p) => Math.abs(p - i) < width * 0.12)) {
          peaks.push(i);
        }
      }
    }

    if (!peaks.length) {
      // Fallback: centro de massa global
      let weighted = 0;
      let mass = 0;
      for (let x = 0; x < width; x++) {
        weighted += x * smoothed[x];
        mass += smoothed[x];
      }
      return [{ x: weighted / mass / (width - 1), mass, radius: 0.15 }];
    }

    // Ordena por massa ao redor do pico e fica com até 2
    const clusters = peaks
      .map((peak) => {
        const radiusPx = Math.max(6, Math.floor(width * 0.1));
        let mass = 0;
        let weighted = 0;
        for (let x = Math.max(0, peak - radiusPx); x <= Math.min(width - 1, peak + radiusPx); x++) {
          mass += smoothed[x];
          weighted += x * smoothed[x];
        }
        return {
          x: mass > 0 ? weighted / mass / (width - 1) : peak / (width - 1),
          mass,
          radius: radiusPx / width,
        };
      })
      .sort((a, b) => b.mass - a.mass)
      .slice(0, 2);

    return clusters;
  }

  /** Diferença de luminância na faixa da boca sob o centro do rosto. */
  private mouthMotion(
    pixels: Buffer | Uint8Array,
    prevGray: Uint8Array,
    width: number,
    height: number,
    centerX: number,
    radius: number,
  ): number {
    const cx = Math.round(centerX * (width - 1));
    const rx = Math.max(4, Math.round(radius * width));
    const y0 = Math.floor(height * 0.42);
    const y1 = Math.floor(height * 0.72);
    let diff = 0;
    let n = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = Math.max(0, cx - rx); x <= Math.min(width - 1, cx + rx); x++) {
        const i = (y * width + x) * 3;
        const g = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        const pg = prevGray[y * width + x];
        diff += Math.abs(g - pg);
        n++;
      }
    }
    return n ? diff / n : 0;
  }

  private async readGrayFromPpm(filePath: string): Promise<{ width: number; height: number; data: Uint8Array }> {
    const buf = await readFile(filePath);
    const ppm = this.parsePpm(buf);
    if (!ppm) return { width: 0, height: 0, data: new Uint8Array() };
    const data = new Uint8Array(ppm.width * ppm.height);
    for (let i = 0; i < data.length; i++) {
      const o = i * 3;
      data[i] = (ppm.pixels[o] + ppm.pixels[o + 1] + ppm.pixels[o + 2]) / 3;
    }
    return { width: ppm.width, height: ppm.height, data };
  }

  private parsePpm(
    buf: Buffer,
  ): { width: number; height: number; pixels: Buffer } | null {
    let offset = 0;
    const readToken = (): string => {
      while (
        offset < buf.length &&
        (buf[offset] === 0x20 || buf[offset] === 0x0a || buf[offset] === 0x0d || buf[offset] === 0x09)
      ) {
        offset++;
      }
      if (buf[offset] === 0x23) {
        while (offset < buf.length && buf[offset] !== 0x0a) offset++;
        return readToken();
      }
      const start = offset;
      while (offset < buf.length && buf[offset] > 0x20) offset++;
      return buf.slice(start, offset).toString('ascii');
    };

    const magic = readToken();
    if (magic !== 'P6') return null;
    const width = parseInt(readToken(), 10);
    const height = parseInt(readToken(), 10);
    const maxVal = parseInt(readToken(), 10);
    if (!width || !height || maxVal !== 255) return null;
    if (buf[offset] === 0x0a || buf[offset] === 0x20) offset++;
    return { width, height, pixels: buf.subarray(offset) };
  }

  private isSkin(r: number, g: number, b: number): boolean {
    // Tom de pele em RGB + regra YCbCr leve (cobre tons mais escuros)
    const rgbOk =
      r > 60 &&
      g > 30 &&
      b > 15 &&
      r >= g &&
      r > b &&
      Math.abs(r - g) > 10 &&
      r - b > 10;

    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    const ycbcrOk = y > 40 && cb > 77 && cb < 135 && cr > 130 && cr < 180;

    return rgbOk || ycbcrOk;
  }
}
