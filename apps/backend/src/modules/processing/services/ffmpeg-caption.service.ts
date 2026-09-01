import { Injectable } from '@nestjs/common';
import { writeFile } from 'fs/promises';
import type { CaptionStyle, Transcript } from '@ai-video-cutter/shared-types';
import type { CaptionService, GenerateCaptionsOptions } from '../interfaces/caption-service.interface';
import { FfmpegService } from './ffmpeg.service';

interface AssStyleDef {
  name: string;
  line: string;
}

const STYLES: Record<CaptionStyle, AssStyleDef> = {
  clean: {
    name: 'Clean',
    line: 'Style: Clean,Arial,52,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,3,0,2,60,60,100,1',
  },
  boxed: {
    name: 'Boxed',
    line: 'Style: Boxed,Arial,56,&H00FFFFFF,&H000000FF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,3,0,0,2,50,50,140,1',
  },
  reels: {
    name: 'Reels',
    line: 'Style: Reels,Arial Black,72,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,0,2,40,40,220,1',
  },
  karaoke: {
    name: 'Karaoke',
    line: 'Style: Karaoke,Arial Black,68,&H0000FFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,0,2,40,40,200,1',
  },
};

@Injectable()
export class FfmpegCaptionService implements CaptionService {
  constructor(private readonly ffmpeg: FfmpegService) {}

  async generateSrt(transcript: Transcript): Promise<string> {
    const lines: string[] = [];
    transcript.segments.forEach((seg, i) => {
      const text = wrapText(seg.text.trim(), 42);
      lines.push(String(i + 1));
      lines.push(`${formatSrtTime(seg.start)} --> ${formatSrtTime(seg.end)}`);
      lines.push(text);
      lines.push('');
    });
    return lines.join('\n');
  }

  async generateAss(transcript: Transcript, options: GenerateCaptionsOptions = {}): Promise<string> {
    const style = options.style ?? 'reels';
    const playResX = options.playResX ?? 1080;
    const playResY = options.playResY ?? 1920;
    const styleDef = STYLES[style] ?? STYLES.reels;

    const header = `[Script Info]
Title: AI Video Cutter Captions
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styleDef.line}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const events =
      style === 'karaoke'
        ? this.buildKaraokeEvents(transcript, styleDef.name)
        : transcript.segments
            .map((seg) => {
              const text = escapeAss(wrapText(seg.text.trim(), style === 'reels' ? 28 : 36));
              return `Dialogue: 0,${formatAssTime(seg.start)},${formatAssTime(seg.end)},${styleDef.name},,0,0,0,,${text}`;
            })
            .join('\n');

    return header + events + '\n';
  }

  async burnCaptions(videoPath: string, captionsPath: string, outputPath: string): Promise<void> {
    await this.ffmpeg.generateCaptions({ videoPath, subtitlePath: captionsPath, outputPath });
  }

  async writeSrtFile(transcript: Transcript, filePath: string): Promise<void> {
    await writeFile(filePath, await this.generateSrt(transcript), 'utf-8');
  }

  async writeAssFile(
    transcript: Transcript,
    filePath: string,
    options?: GenerateCaptionsOptions,
  ): Promise<void> {
    await writeFile(filePath, await this.generateAss(transcript, options), 'utf-8');
  }

  /** Quebra o segmento em palavras com tags \\k para efeito karaoke. */
  private buildKaraokeEvents(transcript: Transcript, styleName: string): string {
    return transcript.segments
      .map((seg) => {
        const words = seg.text.trim().split(/\s+/).filter(Boolean);
        if (!words.length) return '';
        const durCs = Math.max(1, Math.round((seg.end - seg.start) * 100));
        const perWord = Math.max(1, Math.floor(durCs / words.length));
        const karaoke = words.map((w) => `{\\k${perWord}}${escapeAss(w)}`).join(' ');
        return `Dialogue: 0,${formatAssTime(seg.start)},${formatAssTime(seg.end)},${styleName},,0,0,0,,${karaoke}`;
      })
      .filter(Boolean)
      .join('\n');
  }
}

function wrapText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const words = text.split(/\s+/);
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
  return lines.slice(0, 3).join('\n');
}

function escapeAss(text: string): string {
  return text.replace(/\n/g, '\\N').replace(/,/g, '').replace(/\{/g, '(').replace(/\}/g, ')');
}

function formatSrtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 1000);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

function formatAssTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.round((sec % 1) * 100);
  return `${h}:${pad(m, 2)}:${pad(s, 2)}.${pad(cs, 2)}`;
}

function pad(n: number, len: number): string {
  return String(n).padStart(len, '0');
}
