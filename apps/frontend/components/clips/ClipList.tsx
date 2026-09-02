'use client';

import { Loader2, Scissors, XCircle } from 'lucide-react';
import { ClipCard } from './ClipCard';
import type { Clip, ClipLayout, Transcript } from '@/types';

interface ClipListProps {
  clips: Clip[];
  transcript?: Transcript | null;
  generating?: boolean;
  sourceVideoUrl?: string;
  onRender: (clipId: string) => Promise<Clip>;
  onToggleCaptions?: (clipId: string, enabled: boolean) => Promise<Clip>;
  onSetLayout?: (clipId: string, layout: ClipLayout) => Promise<Clip>;
  onSetZoom?: (clipId: string, centerZoom: number) => Promise<Clip>;
  onUpdateText?: (clipId: string, payload: { title?: string; titleCta?: string }) => Promise<Clip>;
  onDelete?: (clipId: string) => Promise<void>;
  onCancel?: (clipId: string) => Promise<void>;
  onCancelPending?: () => Promise<void>;
}

export function ClipList({
  clips,
  transcript,
  generating,
  sourceVideoUrl,
  onRender,
  onToggleCaptions,
  onSetLayout,
  onSetZoom,
  onUpdateText,
  onDelete,
  onCancel,
  onCancelPending,
}: ClipListProps) {
  const readyCount = clips.filter((c) => c.status === 'completed').length;
  const pendingCount = clips.filter((c) => c.status !== 'completed').length;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Seus cortes</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {clips.length === 0
              ? 'Os melhores momentos aparecem aqui com preview e legendas.'
              : `${readyCount}/${clips.length} prontos para download`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {generating && (
            <span className="inline-flex items-center gap-1.5 text-xs text-brand-300">
              <Loader2 size={12} className="animate-spin" />
              Gerando…
            </span>
          )}
          {pendingCount > 0 && onCancelPending && (
            <button
              type="button"
              onClick={() => void onCancelPending()}
              className="btn-secondary !py-1.5 text-xs text-amber-200"
            >
              <XCircle size={14} />
              Cancelar pendentes ({pendingCount})
            </button>
          )}
        </div>
      </div>

      {clips.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-14 text-center">
          <Scissors size={22} className="text-zinc-600" />
          <p className="max-w-sm text-sm text-zinc-500">
            {generating
              ? 'Analisando o vídeo e montando os cortes com legendas…'
              : 'Clique em “Analisar e gerar cortes” para a IA dividir o vídeo nos melhores momentos.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clips.map((clip, index) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              index={index}
              transcript={transcript}
              sourceVideoUrl={sourceVideoUrl}
              onRender={onRender}
              onToggleCaptions={onToggleCaptions}
              onSetLayout={onSetLayout}
              onSetZoom={onSetZoom}
              onUpdateText={onUpdateText}
              onDelete={onDelete}
              onCancel={onCancel}
            />
          ))}
        </div>
      )}
    </section>
  );
}
