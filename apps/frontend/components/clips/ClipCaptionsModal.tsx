'use client';

import { useEffect } from 'react';
import { Captions, X } from 'lucide-react';
import { formatTime, cn } from '@/lib/utils';
import type { Transcript, TranscriptSegment } from '@/types';

interface ClipCaptionsModalProps {
  open: boolean;
  onClose: () => void;
  clipIndex: number;
  startTime: number;
  endTime: number;
  transcript: Transcript | null | undefined;
}

function segmentsForClip(
  transcript: Transcript | null | undefined,
  startTime: number,
  endTime: number,
): TranscriptSegment[] {
  if (!transcript?.segments.length) return [];
  return transcript.segments.filter((seg) => seg.end > startTime && seg.start < endTime);
}

export function ClipCaptionsModal({
  open,
  onClose,
  clipIndex,
  startTime,
  endTime,
  transcript,
}: ClipCaptionsModalProps) {
  const segments = segmentsForClip(transcript, startTime, endTime);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clip-captions-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Fechar legendas"
      />
      <div className="relative z-10 flex max-h-[min(80vh,32rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-surface-border bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-surface-border px-4 py-3">
          <div className="min-w-0">
            <p id="clip-captions-title" className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Captions size={16} className="shrink-0 text-emerald-400" />
              Legendas · Corte #{clipIndex + 1}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
              {formatTime(startTime)} → {formatTime(endTime)} · {segments.length} trecho
              {segments.length === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-surface-raised hover:text-zinc-200"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {segments.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-zinc-500">
              Nenhuma legenda neste intervalo. Gere a transcrição do projeto para ver os trechos com timestamp.
            </p>
          ) : (
            <ul className="space-y-1">
              {segments.map((seg) => {
                const relStart = Math.max(0, seg.start - startTime);
                const relEnd = Math.min(endTime - startTime, seg.end - startTime);
                return (
                  <li
                    key={seg.id}
                    className={cn(
                      'flex gap-3 rounded-lg px-3 py-2.5',
                      'bg-surface-raised/50 text-zinc-300',
                    )}
                  >
                    <span className="w-[4.5rem] shrink-0 font-mono text-[11px] leading-snug text-zinc-500">
                      {formatTime(relStart)}
                      <span className="text-zinc-600">–</span>
                      {formatTime(relEnd)}
                    </span>
                    <span className="text-sm leading-snug text-zinc-200">{seg.text}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export { segmentsForClip };
