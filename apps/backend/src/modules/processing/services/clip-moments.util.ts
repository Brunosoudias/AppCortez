import type { BestMoment, TranscriptSegment } from '@ai-video-cutter/shared-types';
import { cleanSpeechText, isPlaceholderSpeech } from './speech-text.util';

export interface ContextualMomentsOptions {
  minDuration?: number;
  maxDuration?: number;
  /** Duração de referência (não fixa) — usada como guia ao expandir trechos. */
  targetDuration?: number;
  maxMoments?: number;
}

const DEFAULT_MIN = 12;
const DEFAULT_MAX = 90;

interface ContextBlock {
  start: number;
  end: number;
  segments: TranscriptSegment[];
}

function sentenceEnds(text: string): boolean {
  return /[.!?…]["']?\s*$/.test(text.trim());
}

function gapBetween(a: TranscriptSegment, b: TranscriptSegment): number {
  return Math.max(0, b.start - a.end);
}

/** Agrupa segmentos em blocos coerentes (pausa, fim de frase ou teto de duração). */
export function buildContextualBlocks(
  segments: TranscriptSegment[],
  minDuration: number,
  maxDuration: number,
): ContextBlock[] {
  if (!segments.length) return [];

  const blocks: ContextBlock[] = [];
  let current: TranscriptSegment[] = [];

  const flush = () => {
    if (!current.length) return;
    blocks.push({
      start: current[0].start,
      end: current[current.length - 1].end,
      segments: [...current],
    });
    current = [];
  };

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (current.length) {
      const last = current[current.length - 1];
      const gap = gapBetween(last, seg);
      const dur = seg.end - current[0].start;
      if (gap > 1.2 || sentenceEnds(last.text) || dur >= maxDuration) {
        flush();
      }
    }
    current.push(seg);
    const dur = current[current.length - 1].end - current[0].start;
    if (dur >= maxDuration) flush();
  }
  flush();

  return mergeShortBlocks(blocks, minDuration, maxDuration);
}

function mergeShortBlocks(blocks: ContextBlock[], minDuration: number, maxDuration: number): ContextBlock[] {
  if (blocks.length <= 1) return blocks;

  const merged: ContextBlock[] = [];
  let i = 0;
  while (i < blocks.length) {
    let block = blocks[i];
    while (block.end - block.start < minDuration && i + 1 < blocks.length) {
      i++;
      const next = blocks[i];
      block = {
        start: block.start,
        end: next.end,
        segments: [...block.segments, ...next.segments],
      };
    }
    if (block.end - block.start > maxDuration) {
      merged.push(...splitLongBlock(block, minDuration, maxDuration));
    } else if (block.end - block.start >= minDuration * 0.75) {
      merged.push(block);
    }
    i++;
  }
  return merged;
}

function splitLongBlock(block: ContextBlock, minDuration: number, maxDuration: number): ContextBlock[] {
  const parts: ContextBlock[] = [];
  let chunk: TranscriptSegment[] = [];

  const flushChunk = () => {
    if (!chunk.length) return;
    const dur = chunk[chunk.length - 1].end - chunk[0].start;
    if (dur >= minDuration * 0.75) {
      parts.push({
        start: chunk[0].start,
        end: chunk[chunk.length - 1].end,
        segments: [...chunk],
      });
    }
    chunk = [];
  };

  for (let i = 0; i < block.segments.length; i++) {
    const seg = block.segments[i];
    chunk.push(seg);
    const dur = seg.end - chunk[0].start;
    const isLast = i === block.segments.length - 1;
    if ((sentenceEnds(seg.text) && dur >= minDuration) || dur >= maxDuration || isLast) {
      flushChunk();
    }
  }
  flushChunk();
  return parts.length ? parts : [block];
}

/** Expande a partir de um segmento forte até limites naturais. */
export function expandContextWindow(
  segments: TranscriptSegment[],
  centerIdx: number,
  minDuration: number,
  maxDuration: number,
  targetDuration: number,
): ContextBlock | null {
  if (!segments[centerIdx]) return null;

  let startIdx = centerIdx;
  let endIdx = centerIdx;

  const duration = () => segments[endIdx].end - segments[startIdx].start;
  const variation = 0.65 + (centerIdx % 5) * 0.08;
  const goal = Math.min(maxDuration, Math.max(minDuration, targetDuration * variation));

  while (duration() < goal && (startIdx > 0 || endIdx < segments.length - 1)) {
    const canStart = startIdx > 0;
    const canEnd = endIdx < segments.length - 1;
    if (!canStart && !canEnd) break;

    const expandStart = canStart && (!canEnd || duration() < minDuration || (centerIdx + startIdx) % 2 === 0);
    if (expandStart) startIdx--;
    else if (canEnd) endIdx++;

    if (duration() >= maxDuration) {
      if (endIdx > startIdx && duration() > maxDuration) endIdx--;
      break;
    }
  }

  while (duration() < minDuration && startIdx > 0) startIdx--;
  while (duration() < minDuration && endIdx < segments.length - 1) endIdx++;

  if (duration() > maxDuration) {
    while (endIdx > startIdx && duration() > maxDuration) endIdx--;
  }

  const slice = segments.slice(startIdx, endIdx + 1);
  if (!slice.length || duration() < minDuration * 0.5) return null;

  return {
    start: slice[0].start,
    end: slice[slice.length - 1].end,
    segments: slice,
  };
}

export function snapMomentToSegments(moment: BestMoment, segments: TranscriptSegment[]): BestMoment {
  if (!segments.length) return moment;

  const real = segments.filter((s) => s.text.trim() && !isPlaceholderSpeech(s.text));
  const pool = real.length ? real : segments;

  let startIdx = 0;
  let endIdx = pool.length - 1;

  for (let i = 0; i < pool.length; i++) {
    if (pool[i].end > moment.startTime) {
      startIdx = i;
      break;
    }
  }
  for (let i = pool.length - 1; i >= 0; i--) {
    if (pool[i].start < moment.endTime) {
      endIdx = i;
      break;
    }
  }

  if (startIdx > endIdx) return moment;

  return {
    ...moment,
    startTime: Number(pool[startIdx].start.toFixed(2)),
    endTime: Number(pool[endIdx].end.toFixed(2)),
  };
}

export function blockToMoment(
  block: ContextBlock,
  score: number,
  reason: string,
  title: string,
): BestMoment {
  return {
    startTime: Number(block.start.toFixed(2)),
    endTime: Number(block.end.toFixed(2)),
    score,
    reason,
    title,
  };
}

export function filterRealSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  return segments.filter((s) => {
    const t = cleanSpeechText(s.text);
    return t.length > 0 && !isPlaceholderSpeech(s.text);
  });
}

export function dedupeMoments(moments: BestMoment[], maxMoments: number): BestMoment[] {
  const sorted = [...moments].sort((a, b) => b.score - a.score);
  const picked: BestMoment[] = [];

  for (const c of sorted) {
    if (picked.length >= maxMoments) break;
    const dur = c.endTime - c.startTime;
    if (dur < 8) continue;

    const overlaps = picked.some((p) => {
      const overlap = Math.min(p.endTime, c.endTime) - Math.max(p.startTime, c.startTime);
      const minDur = Math.min(p.endTime - p.startTime, dur);
      return overlap > minDur * 0.45;
    });
    if (!overlaps) picked.push(c);
  }

  return picked.sort((a, b) => a.startTime - b.startTime);
}

export function resolveMomentBounds(options: ContextualMomentsOptions = {}) {
  const target = options.targetDuration ?? 45;
  return {
    minDuration: options.minDuration ?? DEFAULT_MIN,
    maxDuration: options.maxDuration ?? Math.max(DEFAULT_MAX, target + 30),
    targetDuration: target,
    maxMoments: options.maxMoments ?? 8,
  };
}
