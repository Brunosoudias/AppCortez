'use client';

import { useState } from 'react';
import { Brain, Clapperboard, FileOutput, Loader2, Mic, Wand2 } from 'lucide-react';

interface AiActionsPanelProps {
  busy?: boolean;
  jobMessage?: string | null;
  hasTranscript: boolean;
  hasAnalysis: boolean;
  analysisSummary?: string | null;
  videoReady?: boolean;
  onTranscribe: () => Promise<void>;
  onAnalyze: () => Promise<void>;
  onGenerateViralClips: () => Promise<void>;
  onExportBatch: () => Promise<void>;
}

export function AiActionsPanel({
  busy,
  jobMessage,
  hasTranscript,
  hasAnalysis,
  analysisSummary,
  videoReady = true,
  onTranscribe,
  onAnalyze,
  onGenerateViralClips,
  onExportBatch,
}: AiActionsPanelProps) {
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na operação');
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Brain size={18} className="text-brand-400" />
        <div>
          <p className="text-sm font-semibold text-zinc-100">Cortes automáticos</p>
          <p className="text-xs text-zinc-500">
            A IA analisa o vídeo, escolhe os melhores momentos, gera MP4 9:16 com legendas em
            português e mostra cada um em um card para você baixar.
          </p>
        </div>
      </div>

      <button
        onClick={() => void run(onGenerateViralClips)}
        disabled={busy || !videoReady}
        className="btn-primary w-full justify-center !py-3 text-sm sm:w-auto"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Clapperboard size={16} />}
        Analisar e gerar cortes
      </button>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => void run(onTranscribe)}
          disabled={busy || !videoReady}
          className="btn-secondary !py-1.5 text-xs"
        >
          <Mic size={14} />
          Só transcrever
        </button>
        <button
          onClick={() => void run(onAnalyze)}
          disabled={busy || !hasTranscript}
          className="btn-secondary !py-1.5 text-xs"
        >
          <Wand2 size={14} />
          Só analisar
        </button>
        <button onClick={() => void run(onExportBatch)} disabled={busy} className="btn-secondary !py-1.5 text-xs">
          <FileOutput size={14} />
          Exportar lote
        </button>
      </div>

      {jobMessage && (
        <p className="mt-3 flex items-center gap-2 text-xs text-brand-300">
          <Loader2 size={12} className="animate-spin" /> {jobMessage}
        </p>
      )}
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
      {hasAnalysis && analysisSummary && (
        <p className="mt-3 rounded-lg bg-surface-raised px-3 py-2 text-xs leading-relaxed text-zinc-400">
          {analysisSummary}
        </p>
      )}
    </div>
  );
}
