'use client';

import { useRef, type MouseEvent } from 'react';
import { formatTime } from '@/lib/utils';

interface TimelineProps {
  duration: number;
  currentTime: number;
  startMark: number | null;
  endMark: number | null;
  onSeek: (time: number) => void;
}

export function Timeline({ duration, currentTime, startMark, endMark, onSeek }: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    if (!trackRef.current || !duration) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  }

  const pct = (t: number) => (duration ? `${Math.min(100, Math.max(0, (t / duration) * 100))}%` : '0%');

  return (
    <div className="card p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Timeline</p>

      <div
        ref={trackRef}
        onClick={handleClick}
        className="relative h-3 w-full cursor-pointer rounded-full bg-surface-raised"
      >
        {startMark !== null && endMark !== null && (
          <div
            className="absolute top-0 h-full rounded-full bg-brand-600/40"
            style={{ left: pct(startMark), width: `calc(${pct(endMark)} - ${pct(startMark)})` }}
          />
        )}

        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
          style={{ left: pct(currentTime) }}
          title={formatTime(currentTime)}
        />

        {startMark !== null && (
          <div
            className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400"
            style={{ left: pct(startMark) }}
            title={`Início: ${formatTime(startMark)}`}
          />
        )}

        {endMark !== null && (
          <div
            className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-400"
            style={{ left: pct(endMark) }}
            title={`Fim: ${formatTime(endMark)}`}
          />
        )}
      </div>

      <div className="mt-2 flex justify-between text-[11px] text-zinc-600">
        <span>00:00</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
