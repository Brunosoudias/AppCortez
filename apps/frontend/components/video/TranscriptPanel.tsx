'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { formatTime, cn } from '@/lib/utils';
import type { Transcript } from '@/types';

interface TranscriptPanelProps {
  transcript: Transcript | null;
  loading?: boolean;
  currentTime: number;
  onSeek: (time: number) => void;
  sourceHint?: string;
}

export function TranscriptPanel({ transcript, loading, currentTime, onSeek, sourceHint }: TranscriptPanelProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!transcript?.segments.length) return;
    const active = transcript.segments.find((s) => currentTime >= s.start && currentTime < s.end);
    setActiveId(active?.id ?? null);
  }, [currentTime, transcript]);

  if (loading) {
    return (
      <div className="card flex items-center gap-2 p-5 text-sm text-zinc-500">
        <Loader2 size={16} className="animate-spin" /> Carregando transcrição…
      </div>
    );
  }

  if (!transcript) {
    return (
      <div className="card p-5 text-sm text-zinc-500">
        Nenhuma transcrição ainda. Clique em <strong className="text-zinc-300">Transcrever</strong> para gerar.
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-surface-border px-5 py-3">
        <div>
          <p className="text-sm font-semibold text-zinc-200">Transcrição</p>
          <p className="text-xs text-zinc-500">
            {transcript.segments.length} segmentos
            {transcript.language ? ` · ${transcript.language}` : ''}
            {transcript.source ? ` · ${transcript.source}` : ''}
            {sourceHint ? ` · ${sourceHint}` : ''}
          </p>
        </div>
      </div>
      <div className="max-h-72 space-y-1 overflow-y-auto p-3">
        {transcript.segments.map((seg) => {
          const active = seg.id === activeId;
          return (
            <button
              key={seg.id}
              type="button"
              onClick={() => onSeek(seg.start)}
              className={cn(
                'flex w-full gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                active ? 'bg-brand-600/20 text-zinc-100' : 'text-zinc-400 hover:bg-surface-raised hover:text-zinc-200',
              )}
            >
              <span className="w-12 shrink-0 font-mono text-[11px] text-zinc-500">{formatTime(seg.start)}</span>
              <span className="text-sm leading-snug">{seg.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
