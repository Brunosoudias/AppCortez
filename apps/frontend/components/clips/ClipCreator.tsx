'use client';

import { useState } from 'react';
import { Scissors } from 'lucide-react';
import { formatTime, parseTimeToSeconds } from '@/lib/utils';
import { CLIP_LAYOUT_LABELS, type ClipAspectRatio, type ClipLayout } from '@/types';

interface ClipCreatorProps {
  startMark: number | null;
  endMark: number | null;
  currentTime: number;
  layout?: ClipLayout;
  onLayoutChange?: (layout: ClipLayout) => void;
  onMarkStart: () => void;
  onMarkEnd: () => void;
  onCreateClip: (
    startTime: number,
    endTime: number,
    format: ClipAspectRatio,
    options?: { layout?: ClipLayout; title?: string; titleCta?: string },
  ) => Promise<void>;
}

const FORMATS: ClipAspectRatio[] = ['16:9', '9:16', '1:1'];
const LAYOUTS: ClipLayout[] = ['title', 'crop'];

export function ClipCreator({
  startMark,
  endMark,
  currentTime,
  layout: layoutProp,
  onLayoutChange,
  onMarkStart,
  onMarkEnd,
  onCreateClip,
}: ClipCreatorProps) {
  const [format, setFormat] = useState<ClipAspectRatio>('9:16');
  const [layoutLocal, setLayoutLocal] = useState<ClipLayout>('title');
  const layout = layoutProp ?? layoutLocal;
  const [title, setTitle] = useState('');
  const [titleCta, setTitleCta] = useState('DESLIZE PARA SABER MAIS');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = startMark !== null && endMark !== null && endMark > startMark;
  const showLayout = format === '9:16';
  const showTitleFields = showLayout && layout === 'title';

  function selectLayout(next: ClipLayout) {
    setLayoutLocal(next);
    onLayoutChange?.(next);
  }

  async function handleCreate() {
    if (!valid || startMark === null || endMark === null) return;
    setCreating(true);
    setError(null);
    try {
      await onCreateClip(startMark, endMark, format, {
        layout: showLayout ? layout : 'crop',
        title: showTitleFields ? title.trim() || undefined : undefined,
        titleCta: showTitleFields ? titleCta.trim() || undefined : undefined,
      });
      if (showTitleFields) setTitle('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar corte');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="card grid grid-cols-2 divide-x divide-surface-border">
      <MarkColumn label="Início" value={startMark} accent="emerald" onMark={onMarkStart} current={currentTime} />
      <MarkColumn label="Fim" value={endMark} accent="red" onMark={onMarkEnd} current={currentTime} />

      <div className="col-span-2 space-y-3 border-t border-surface-border p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            {FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                className={
                  f === format
                    ? 'rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white'
                    : 'rounded-md border border-surface-border px-2.5 py-1 text-xs font-medium text-zinc-400 hover:text-zinc-200'
                }
              >
                {f}
              </button>
            ))}
          </div>

          <button onClick={handleCreate} disabled={!valid || creating} className="btn-primary ml-auto">
            <Scissors size={16} />
            {creating ? 'Criando…' : 'Criar corte'}
          </button>
        </div>

        {showLayout && (
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">Layout vertical</p>
            <div className="flex flex-wrap gap-1.5">
              {LAYOUTS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => selectLayout(l)}
                  className={
                    l === layout
                      ? 'rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white'
                      : 'rounded-md border border-surface-border px-2.5 py-1 text-xs font-medium text-zinc-400 hover:text-zinc-200'
                  }
                  title={
                    l === 'title'
                      ? 'Vídeo em cima, descrição embaixo'
                      : 'Vídeo preenchendo a tela 9:16 inteira'
                  }
                >
                  {CLIP_LAYOUT_LABELS[l]}
                </button>
              ))}
            </div>
          </div>
        )}

        {showTitleFields && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs text-zinc-400 sm:col-span-2">
              <span className="mb-1 block text-zinc-300">Descrição / título (painel de baixo)</span>
              <textarea
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                rows={3}
                maxLength={200}
                placeholder="Ex.: Alguém criou o GTA: Coreia do Norte com IA e o resultado é insano"
                className="w-full resize-none rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none"
              />
            </label>
            <label className="block text-xs text-zinc-400 sm:col-span-2">
              <span className="mb-1 block text-zinc-300">CTA (opcional)</span>
              <input
                type="text"
                value={titleCta}
                onChange={(e) => setTitleCta(e.target.value)}
                maxLength={80}
                className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100 focus:border-brand-500 focus:outline-none"
              />
            </label>
          </div>
        )}
      </div>

      {error && <p className="col-span-2 px-4 pb-3 text-xs text-red-400">{error}</p>}
    </div>
  );
}

function MarkColumn({
  label,
  value,
  accent,
  onMark,
  current,
}: {
  label: string;
  value: number | null;
  accent: 'emerald' | 'red';
  onMark: () => void;
  current: number;
}) {
  return (
    <div className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 font-mono text-lg ${accent === 'emerald' ? 'text-emerald-400' : 'text-red-400'}`}>
        {value !== null ? formatTime(value) : '--:--'}
      </p>
      <button onClick={onMark} className="btn-secondary mt-3 w-full !py-1.5 text-xs">
        Marcar em {formatTime(current)}
      </button>
    </div>
  );
}

// Re-exportado para permitir uso avulso de parseTimeToSeconds por quem editar
// os campos manualmente no futuro (ex: inputs de texto "00:32").
export { parseTimeToSeconds };
