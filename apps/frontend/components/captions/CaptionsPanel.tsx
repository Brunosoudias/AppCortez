'use client';

import { useState } from 'react';
import { Captions, Download, Loader2, Sparkles } from 'lucide-react';
import { CAPTION_STYLE_LABELS, type CaptionStyle, type Transcript } from '@/types';

const STYLES: CaptionStyle[] = ['reels', 'boxed', 'clean', 'karaoke'];

interface CaptionsPanelProps {
  projectId: string;
  transcript: Transcript | null;
  generating?: boolean;
  onGenerate: (style: CaptionStyle) => Promise<void>;
  captionsReady?: boolean;
  apiBase?: string;
}

export function CaptionsPanel({
  projectId,
  transcript,
  generating,
  onGenerate,
  captionsReady,
  apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333',
}: CaptionsPanelProps) {
  const [style, setStyle] = useState<CaptionStyle>('reels');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = Boolean(transcript?.segments.length);

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    try {
      await onGenerate(style);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar legendas');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600/15 text-brand-400">
          <Captions size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium text-zinc-200">
            Legendas estilizadas <Sparkles size={14} className="text-brand-400" />
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {ready
              ? 'Escolha um estilo ASS (Reels, caixa, clean ou karaoke) e gere/baixe. O player já mostra overlay ao vivo.'
              : 'Gere a transcrição primeiro para criar legendas.'}
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {STYLES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={!ready}
                onClick={() => setStyle(s)}
                className={
                  s === style
                    ? 'rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white'
                    : 'rounded-md border border-surface-border px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200'
                }
              >
                {CAPTION_STYLE_LABELS[s]}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => void handleGenerate()}
              disabled={!ready || busy || generating}
              className="btn-secondary !py-1.5 text-xs"
            >
              {busy || generating ? <Loader2 size={14} className="animate-spin" /> : <Captions size={14} />}
              {captionsReady ? 'Regenerar' : 'Gerar SRT / ASS'}
            </button>
            {captionsReady && (
              <>
                <a
                  href={`${apiBase}/projects/${projectId}/captions/srt`}
                  className="btn-secondary !py-1.5 text-xs"
                  download
                >
                  <Download size={14} /> SRT
                </a>
                <a
                  href={`${apiBase}/projects/${projectId}/captions/ass`}
                  className="btn-secondary !py-1.5 text-xs"
                  download
                >
                  <Download size={14} /> ASS
                </a>
              </>
            )}
          </div>
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  );
}
