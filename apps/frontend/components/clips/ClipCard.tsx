'use client';

import { useMemo, useState } from 'react';
import { Captions, Download, Flame, Loader2, Play, Trash2, XCircle } from 'lucide-react';
import { CLIP_STATUS_COLOR, CLIP_STATUS_LABEL, cn, formatTime } from '@/lib/utils';
import { clipsApi } from '@/services/api';
import type { Clip, ClipLayout } from '@/types';

interface ClipCardProps {
  clip: Clip;
  index: number;
  onRender: (clipId: string) => Promise<Clip>;
  onToggleCaptions?: (clipId: string, enabled: boolean) => Promise<Clip>;
  onSetLayout?: (clipId: string, layout: 'crop' | 'title') => Promise<Clip>;
  onDelete?: (clipId: string) => Promise<void>;
  onCancel?: (clipId: string) => Promise<void>;
}

const CARD_LAYOUTS: Array<{ id: Extract<ClipLayout, 'crop' | 'title'>; label: string; hint: string }> = [
  { id: 'title', label: 'Vídeo + texto', hint: 'Vídeo em cima, painel preto com descrição embaixo' },
  { id: 'crop', label: '9:16 completo', hint: 'Vídeo preenchendo a tela inteira' },
];

export function ClipCard({ clip, index, onRender, onToggleCaptions, onSetLayout, onDelete, onCancel }: ClipCardProps) {
  const [rendering, setRendering] = useState(false);
  const [togglingCaptions, setTogglingCaptions] = useState(false);
  const [changingLayout, setChangingLayout] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const mediaUrl = useMemo(() => {
    if (clip.status !== 'completed') return null;
    return `${clipsApi.streamUrl(clip.id)}?t=${encodeURIComponent(clip.updatedAt || clip.id)}`;
  }, [clip.id, clip.status, clip.updatedAt]);

  const captionsOn = Boolean(
    clip.captionsFile || (clip.outputFile && clip.outputFile.includes('.captioned')),
  );

  async function handleRender() {
    setRendering(true);
    setLocalError(null);
    try {
      await onRender(clip.id);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Falha ao iniciar render');
    } finally {
      setRendering(false);
    }
  }

  async function handleToggleCaptions(next: boolean) {
    if (!onToggleCaptions) return;
    setTogglingCaptions(true);
    setLocalError(null);
    try {
      await onToggleCaptions(clip.id, next);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Falha ao alterar legendas');
    } finally {
      setTogglingCaptions(false);
    }
  }

  async function handleSetLayout(layout: 'crop' | 'title') {
    if (!onSetLayout || layout === (clip.layout ?? 'title')) return;
    setChangingLayout(true);
    setLocalError(null);
    try {
      await onSetLayout(clip.id, layout);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Falha ao alterar layout');
    } finally {
      setChangingLayout(false);
    }
  }

  async function handleCancel() {
    if (!onCancel) return;
    setCancelling(true);
    setLocalError(null);
    try {
      await onCancel(clip.id);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Falha ao cancelar');
    } finally {
      setCancelling(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    const ok = window.confirm(`Excluir o Corte #${index + 1}? Esta ação não pode ser desfeita.`);
    if (!ok) return;
    setDeleting(true);
    setLocalError(null);
    try {
      await onDelete(clip.id);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Falha ao excluir o corte');
      setDeleting(false);
    }
  }

  const isProcessing = clip.status === 'processing' || rendering || togglingCaptions || changingLayout;
  const isBusy = isProcessing || deleting || cancelling;
  const progress = typeof clip.progress === 'number' ? clip.progress : 0;
  const isReady = clip.status === 'completed';
  const isFailed = clip.status === 'failed';
  const activeLayout: 'crop' | 'title' =
    clip.layout === 'crop' ? 'crop' : clip.layout === 'stack' ? 'title' : clip.layout ?? 'title';
  const showLayoutPicker = clip.format === '9:16' && onSetLayout;

  return (
    <article className="card flex flex-col overflow-hidden p-0">
      <div className="relative aspect-[9/16] w-full bg-black">
        {isReady && mediaUrl ? (
          <video
            key={mediaUrl}
            src={mediaUrl}
            controls
            playsInline
            preload="metadata"
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            {isProcessing && !cancelling ? (
              <>
                <Loader2 size={28} className="animate-spin text-brand-400" />
                <p className="text-xs text-zinc-400">
                  {changingLayout
                    ? 'Alterando layout…'
                    : togglingCaptions || (clip.burnCaptions && captionsOn === false && clip.status === 'processing')
                      ? 'Aplicando legendas…'
                      : 'Renderizando…'}
                </p>
                <div className="h-1.5 w-2/3 overflow-hidden rounded-full bg-surface-raised">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-[width] duration-300"
                    style={{ width: `${Math.max(progress, 6)}%` }}
                  />
                </div>
                <p className="font-mono text-[11px] text-zinc-500">{progress}%</p>
              </>
            ) : isFailed ? (
              <p className="text-xs text-red-400">{clip.errorMessage || 'Falha no render'}</p>
            ) : cancelling ? (
              <>
                <Loader2 size={28} className="animate-spin text-red-300" />
                <p className="text-xs text-zinc-400">Cancelando…</p>
              </>
            ) : (
              <>
                <Play size={28} className="text-zinc-600" />
                <p className="text-xs text-zinc-500">Aguardando render</p>
              </>
            )}
          </div>
        )}

        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className={cn('badge backdrop-blur-sm', CLIP_STATUS_COLOR[clip.status])}>
            {CLIP_STATUS_LABEL[clip.status]}
          </span>
          {captionsOn && isReady && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-medium text-white">
              <Captions size={10} />
              PT-BR
            </span>
          )}
        </div>

        {(onDelete || onCancel) && (
          <div className="absolute right-3 top-3 z-10 flex flex-col gap-1.5">
            {!isReady && onCancel && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelling || deleting}
                className="inline-flex h-8 items-center gap-1 rounded-full bg-black/70 px-2.5 text-[11px] font-medium text-amber-200 backdrop-blur-sm transition hover:bg-amber-600 hover:text-white disabled:opacity-50"
                title="Cancelar este corte"
              >
                {cancelling ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                Cancelar
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || cancelling}
                className="inline-flex h-8 w-8 items-center justify-center self-end rounded-full bg-black/70 text-red-300 backdrop-blur-sm transition hover:bg-red-600 hover:text-white disabled:opacity-50"
                title="Excluir corte"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            )}
          </div>
        )}

        {typeof clip.score === 'number' && (
          <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-orange-500/90 px-2 py-0.5 text-[10px] font-medium text-white">
            {clip.score}% <Flame size={10} />
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="text-sm font-semibold text-zinc-100">Corte #{index + 1}</p>
          <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
            {formatTime(clip.startTime)} → {formatTime(clip.endTime)} · {clip.duration.toFixed(1)}s ·{' '}
            {clip.format}
            {clip.layout
              ? ` · ${clip.layout === 'title' ? 'vídeo+texto' : clip.layout === 'stack' ? '2 painéis' : '9:16 completo'}`
              : ''}
          </p>
          <p className="mt-2 line-clamp-2 text-sm text-zinc-300">
            {clip.title ? clip.title : 'Corte automático'}
          </p>
          {clip.reason && <p className="mt-1 line-clamp-2 text-xs text-zinc-600">{clip.reason}</p>}
        </div>

        {showLayoutPicker && (
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">Formato do render</p>
            <div className="grid grid-cols-2 gap-1.5">
              {CARD_LAYOUTS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  title={opt.hint}
                  disabled={isBusy}
                  onClick={() => void handleSetLayout(opt.id)}
                  className={
                    activeLayout === opt.id
                      ? 'rounded-md bg-brand-600 px-2 py-2 text-[11px] font-medium leading-tight text-white'
                      : 'rounded-md border border-surface-border px-2 py-2 text-[11px] font-medium leading-tight text-zinc-400 hover:text-zinc-200 disabled:opacity-50'
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {onToggleCaptions && (
          <label
            className={cn(
              'flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface-raised/60 px-3 py-2.5',
              isBusy && 'pointer-events-none opacity-60',
            )}
          >
            <span className="flex items-center gap-2 text-xs font-medium text-zinc-200">
              <Captions size={14} className={captionsOn ? 'text-emerald-400' : 'text-zinc-500'} />
              Legendas PT-BR
            </span>
            <span className="relative inline-flex h-5 w-9 shrink-0 items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={captionsOn}
                disabled={isBusy || !isReady}
                onChange={(e) => void handleToggleCaptions(e.target.checked)}
              />
              <span className="absolute inset-0 rounded-full bg-zinc-700 transition peer-checked:bg-emerald-500 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400" />
              <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-4" />
            </span>
          </label>
        )}

        {localError && <p className="text-xs text-red-400">{localError}</p>}

        <div className="mt-auto flex flex-col gap-2">
          {isReady ? (
            <>
              <a
                href={clipsApi.downloadUrl(clip.id)}
                className="btn-primary w-full justify-center !py-2 text-sm"
                download
              >
                <Download size={16} />
                Baixar MP4
              </a>
              {onDelete && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="btn-secondary w-full justify-center !py-2 text-xs text-red-300 hover:text-red-200"
                >
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Excluir corte
                </button>
              )}
            </>
          ) : (
            <>
              {isProcessing && onCancel && (
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="btn-primary w-full justify-center !py-2 text-sm !bg-amber-600 hover:!bg-amber-500"
                >
                  {cancelling ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                  Cancelar render
                </button>
              )}
              {!isProcessing && (
                <button
                  onClick={handleRender}
                  disabled={isBusy}
                  className="btn-primary w-full justify-center !py-2 text-sm"
                >
                  <Play size={16} />
                  {isFailed ? 'Tentar de novo' : 'Renderizar agora'}
                </button>
              )}
              {onDelete && (
                <button
                  onClick={handleDelete}
                  disabled={deleting || cancelling}
                  className="btn-secondary w-full justify-center !py-2 text-xs text-red-300 hover:text-red-200"
                >
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Excluir corte
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
}
