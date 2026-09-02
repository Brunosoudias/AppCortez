'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  Captions,
  Download,
  Flame,
  Loader2,
  Pause,
  Play,
  Save,
  Trash2,
  Volume2,
  VolumeX,
  XCircle,
  ZoomIn,
} from 'lucide-react';
import { CLIP_STATUS_COLOR, CLIP_STATUS_LABEL, cn, formatTime } from '@/lib/utils';
import { clipsApi } from '@/services/api';
import { CLIP_LAYOUT_LABELS, type Clip, type ClipLayout, type Transcript } from '@/types';
import { ClipCaptionsModal, segmentsForClip } from './ClipCaptionsModal';

interface ClipCardProps {
  clip: Clip;
  index: number;
  transcript?: Transcript | null;
  sourceVideoUrl?: string;
  onRender: (clipId: string) => Promise<Clip>;
  onToggleCaptions?: (clipId: string, enabled: boolean) => Promise<Clip>;
  onSetLayout?: (clipId: string, layout: ClipLayout) => Promise<Clip>;
  onSetZoom?: (clipId: string, centerZoom: number) => Promise<Clip>;
  onUpdateText?: (clipId: string, payload: { title?: string; titleCta?: string }) => Promise<Clip>;
  onDelete?: (clipId: string) => Promise<void>;
  onCancel?: (clipId: string) => Promise<void>;
}

const CARD_LAYOUTS: Array<{ id: ClipLayout; label: string; hint: string }> = [
  { id: 'blur', label: CLIP_LAYOUT_LABELS.blur, hint: 'Vídeo no centro com fundo desfocado — igual Shorts do YouTube' },
  { id: 'title', label: CLIP_LAYOUT_LABELS.title, hint: 'Vídeo em cima, painel preto com descrição embaixo' },
  { id: 'stack', label: CLIP_LAYOUT_LABELS.stack, hint: 'Dois painéis de vídeo empilhados com enquadramentos independentes' },
  { id: 'crop', label: CLIP_LAYOUT_LABELS.crop, hint: 'Vídeo preenchendo a tela inteira em 9:16' },
];

const DEFAULT_TITLE_CTA = 'DESLIZE PARA SABER MAIS';

function useClipSegmentPlayback(startTime: number, endTime: number) {
  const clipDuration = Math.max(0, endTime - startTime);
  const [relativeTime, setRelativeTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  const syncToStart = (videos: Array<HTMLVideoElement | null>) => {
    for (const el of videos) {
      if (el) el.currentTime = startTime;
    }
    setRelativeTime(0);
  };

  const handleTimeUpdate = (videos: Array<HTMLVideoElement | null>, source: HTMLVideoElement) => {
    const rel = Math.max(0, Math.min(clipDuration, source.currentTime - startTime));
    setRelativeTime(rel);
    if (source.currentTime >= endTime - 0.05) {
      syncToStart(videos);
      for (const el of videos) {
        void el?.play().catch(() => undefined);
      }
    }
  };

  const togglePlay = (videos: Array<HTMLVideoElement | null>) => {
    const primary = videos.find(Boolean);
    if (!primary) return;
    if (primary.paused) {
      for (const el of videos) void el?.play().catch(() => undefined);
      setPlaying(true);
    } else {
      for (const el of videos) el?.pause();
      setPlaying(false);
    }
  };

  const handlePlayState = (isPlaying: boolean) => setPlaying(isPlaying);

  return { clipDuration, relativeTime, playing, syncToStart, handleTimeUpdate, togglePlay, handlePlayState };
}

function ClipPreviewControls({
  relativeTime,
  clipDuration,
  playing,
  audioMuted,
  onTogglePlay,
  onToggleMute,
}: {
  relativeTime: number;
  clipDuration: number;
  playing: boolean;
  audioMuted: boolean;
  onTogglePlay: () => void;
  onToggleMute: () => void;
}) {
  const progressPct = clipDuration > 0 ? Math.min(100, (relativeTime / clipDuration) * 100) : 0;

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-3 pb-2.5 pt-8">
      <div className="mb-2 h-1 overflow-hidden rounded-full bg-white/20">
        <div className="h-full rounded-full bg-brand-500 transition-[width] duration-100" style={{ width: `${progressPct}%` }} />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onTogglePlay}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
          aria-label={playing ? 'Pausar prévia' : 'Reproduzir prévia'}
        >
          {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
        </button>
        <button
          type="button"
          onClick={onToggleMute}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
          aria-label={audioMuted ? 'Ativar áudio' : 'Silenciar'}
        >
          {audioMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <span className="ml-auto font-mono text-[11px] text-white/90">
          {formatTime(relativeTime)} / {formatTime(clipDuration)}
        </span>
      </div>
    </div>
  );
}

function useClipPreviewAudio(audioRef: RefObject<HTMLVideoElement | null>) {
  const [audioMuted, setAudioMuted] = useState(true);

  function toggleMute() {
    const el = audioRef.current;
    const nextMuted = !audioMuted;
    setAudioMuted(nextMuted);
    if (el) {
      el.muted = nextMuted;
      if (!nextMuted) void el.play().catch(() => undefined);
    }
  }

  return { audioMuted, toggleMute };
}

interface BlurZoomPreviewProps {
  src: string;
  startTime: number;
  endTime: number;
  centerZoom: number;
  cropCenterX?: number;
}

function BlurZoomPreview({ src, startTime, endTime, centerZoom, cropCenterX = 0.5 }: BlurZoomPreviewProps) {
  const bgRef = useRef<HTMLVideoElement>(null);
  const fgRef = useRef<HTMLVideoElement>(null);
  const objectPosition = `${Math.round(cropCenterX * 100)}% 50%`;
  const { audioMuted, toggleMute } = useClipPreviewAudio(fgRef);
  const { clipDuration, relativeTime, playing, syncToStart, handleTimeUpdate, togglePlay, handlePlayState } =
    useClipSegmentPlayback(startTime, endTime);

  const videos = () => [bgRef.current, fgRef.current];

  function handleLoadedMetadata() {
    syncToStart(videos());
    void bgRef.current?.play().catch(() => undefined);
    void fgRef.current?.play().catch(() => undefined);
    handlePlayState(true);
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <video
        ref={bgRef}
        src={src}
        muted
        playsInline
        autoPlay
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => handlePlayState(true)}
        onPause={() => handlePlayState(false)}
        onTimeUpdate={(e) => handleTimeUpdate(videos(), e.currentTarget)}
        className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-[0.93] saturate-[1.08]"
        style={{ objectPosition }}
      />
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        <video
          ref={fgRef}
          src={src}
          muted={audioMuted}
          playsInline
          autoPlay
          preload="metadata"
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={() => handlePlayState(true)}
          onPause={() => handlePlayState(false)}
          onTimeUpdate={(e) => handleTimeUpdate(videos(), e.currentTarget)}
          className="block h-auto w-full max-w-none"
          style={{
            transform: `scale(${centerZoom})`,
            transformOrigin: 'center center',
          }}
        />
      </div>
      <ClipPreviewControls
        relativeTime={relativeTime}
        clipDuration={clipDuration}
        playing={playing}
        audioMuted={audioMuted}
        onTogglePlay={() => togglePlay(videos())}
        onToggleMute={toggleMute}
      />
    </div>
  );
}

function ClipSegmentPreview({ src, startTime, endTime }: { src: string; startTime: number; endTime: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const { audioMuted, toggleMute } = useClipPreviewAudio(ref);
  const { clipDuration, relativeTime, playing, syncToStart, handleTimeUpdate, togglePlay, handlePlayState } =
    useClipSegmentPlayback(startTime, endTime);

  const videos = () => [ref.current];

  return (
    <div className="relative h-full w-full">
      <video
        ref={ref}
        src={src}
        muted={audioMuted}
        playsInline
        autoPlay
        preload="metadata"
        onLoadedMetadata={() => {
          syncToStart(videos());
          void ref.current?.play().catch(() => undefined);
          handlePlayState(true);
        }}
        onPlay={() => handlePlayState(true)}
        onPause={() => handlePlayState(false)}
        onTimeUpdate={(e) => handleTimeUpdate(videos(), e.currentTarget)}
        className="h-full w-full object-contain"
      />
      <ClipPreviewControls
        relativeTime={relativeTime}
        clipDuration={clipDuration}
        playing={playing}
        audioMuted={audioMuted}
        onTogglePlay={() => togglePlay(videos())}
        onToggleMute={toggleMute}
      />
    </div>
  );
}

export function ClipCard({ clip, index, transcript, sourceVideoUrl, onRender, onToggleCaptions, onSetLayout, onSetZoom, onUpdateText, onDelete, onCancel }: ClipCardProps) {
  const [rendering, setRendering] = useState(false);
  const [captionsModalOpen, setCaptionsModalOpen] = useState(false);
  const [togglingCaptions, setTogglingCaptions] = useState(false);
  const [changingLayout, setChangingLayout] = useState(false);
  const [savingZoom, setSavingZoom] = useState(false);
  const [zoomDraft, setZoomDraft] = useState(clip.centerZoom ?? 1);
  const [lastRenderedZoom, setLastRenderedZoom] = useState(clip.centerZoom ?? 1);
  const zoomDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [savingText, setSavingText] = useState(false);
  const [titleDraft, setTitleDraft] = useState(clip.title ?? '');
  const [ctaDraft, setCtaDraft] = useState(clip.titleCta ?? DEFAULT_TITLE_CTA);
  const [deleting, setDeleting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setTitleDraft(clip.title ?? '');
    setCtaDraft(clip.titleCta ?? DEFAULT_TITLE_CTA);
  }, [clip.id, clip.title, clip.titleCta]);

  useEffect(() => {
    setZoomDraft(clip.centerZoom ?? 1);
    setLastRenderedZoom(clip.centerZoom ?? 1);
  }, [clip.id]);

  const prevStatusRef = useRef(clip.status);
  useEffect(() => {
    if (prevStatusRef.current === 'processing' && clip.status === 'completed') {
      setLastRenderedZoom(clip.centerZoom ?? 1);
      setZoomDraft(clip.centerZoom ?? 1);
    }
    prevStatusRef.current = clip.status;
  }, [clip.status, clip.centerZoom]);

  const mediaUrl = useMemo(() => {
    if (clip.status !== 'completed') return null;
    return `${clipsApi.streamUrl(clip.id)}?t=${encodeURIComponent(clip.updatedAt || clip.id)}`;
  }, [clip.id, clip.status, clip.updatedAt]);

  const captionsOn = Boolean(
    clip.captionsFile || (clip.outputFile && clip.outputFile.includes('.captioned')),
  );
  const clipSegments = useMemo(
    () => segmentsForClip(transcript, clip.startTime, clip.endTime),
    [transcript, clip.startTime, clip.endTime],
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

  async function handleSetLayout(layout: ClipLayout) {
    if (!onSetLayout || layout === (clip.layout ?? 'blur')) return;
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

  async function saveZoom(centerZoom: number) {
    if (!onSetZoom) return;
    const saved = clip.centerZoom ?? 1;
    if (Math.abs(centerZoom - saved) < 0.01) return;
    setSavingZoom(true);
    setLocalError(null);
    try {
      await onSetZoom(clip.id, centerZoom);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Falha ao salvar zoom');
      setZoomDraft(saved);
    } finally {
      setSavingZoom(false);
    }
  }

  function handleZoomChange(value: number) {
    setZoomDraft(value);
    if (zoomDebounceRef.current) clearTimeout(zoomDebounceRef.current);
    zoomDebounceRef.current = setTimeout(() => {
      void saveZoom(value);
    }, 600);
  }

  useEffect(() => {
    return () => {
      if (zoomDebounceRef.current) clearTimeout(zoomDebounceRef.current);
    };
  }, []);

  async function handleSaveText() {
    if (!onUpdateText) return;
    setSavingText(true);
    setLocalError(null);
    try {
      await onUpdateText(clip.id, {
        title: titleDraft.trim() || undefined,
        titleCta: ctaDraft.trim() || undefined,
      });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Falha ao salvar texto');
    } finally {
      setSavingText(false);
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

  const isProcessing = clip.status === 'processing' || rendering || togglingCaptions || changingLayout || savingText;
  const isBusy = isProcessing || deleting || cancelling;
  const progress = typeof clip.progress === 'number' ? clip.progress : 0;
  const isReady = clip.status === 'completed';
  const isCreated = clip.status === 'created';
  const isFailed = clip.status === 'failed';
  const activeLayout: ClipLayout = clip.layout ?? 'blur';
  const showLayoutPicker = clip.format === '9:16' && onSetLayout;
  const showZoomControl = activeLayout === 'blur' && onSetZoom;
  const showTextEditor = activeLayout === 'title' && onUpdateText;
  const canAdjustBeforeRender = isCreated || isReady;
  const zoomNeedsRender = showZoomControl && isReady && Math.abs(zoomDraft - lastRenderedZoom) > 0.01;
  const showBlurPreview =
    Boolean(sourceVideoUrl) && activeLayout === 'blur' && (isCreated || zoomNeedsRender);
  const showSegmentPreview = Boolean(sourceVideoUrl) && isCreated && activeLayout !== 'blur';
  const textDirty =
    titleDraft !== (clip.title ?? '') || ctaDraft !== (clip.titleCta ?? DEFAULT_TITLE_CTA);

  return (
    <article className="card flex flex-col overflow-hidden p-0">
      <div className="relative aspect-[9/16] w-full bg-black">
        {showBlurPreview && sourceVideoUrl ? (
          <BlurZoomPreview
            src={sourceVideoUrl}
            startTime={clip.startTime}
            endTime={clip.endTime}
            centerZoom={zoomDraft}
            cropCenterX={clip.cropCenterX}
          />
        ) : showSegmentPreview && sourceVideoUrl ? (
          <ClipSegmentPreview src={sourceVideoUrl} startTime={clip.startTime} endTime={clip.endTime} />
        ) : isReady && mediaUrl ? (
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
                    : savingText
                      ? 'Aplicando texto…'
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
            {!isReady && clip.status === 'processing' && onCancel && (
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
            {clip.layout ? ` · ${CLIP_LAYOUT_LABELS[clip.layout].toLowerCase()}` : ''}
          </p>
          <p className="mt-2 line-clamp-2 text-sm text-zinc-300">
            {clip.title ? clip.title : 'Corte automático'}
          </p>
          {clip.reason && <p className="mt-1 line-clamp-2 text-xs text-zinc-600">{clip.reason}</p>}
        </div>

        {showTextEditor && (
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Texto no vídeo</p>
            <label className="block text-xs text-zinc-400">
              <span className="mb-1 block text-zinc-300">Descrição (painel de baixo)</span>
              <textarea
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                rows={3}
                maxLength={200}
                disabled={isBusy}
                placeholder="Ex.: O que você já foi lá?"
                className="w-full resize-none rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none disabled:opacity-50"
              />
            </label>
            <label className="block text-xs text-zinc-400">
              <span className="mb-1 block text-zinc-300">CTA (opcional)</span>
              <input
                type="text"
                value={ctaDraft}
                onChange={(e) => setCtaDraft(e.target.value)}
                maxLength={80}
                disabled={isBusy}
                className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100 focus:border-brand-500 focus:outline-none disabled:opacity-50"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleSaveText()}
              disabled={isBusy || !textDirty}
              className="btn-secondary w-full justify-center !py-2 text-xs"
            >
              {savingText ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Aplicar no vídeo
            </button>
          </div>
        )}

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

        {showZoomControl && (
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                <span className="inline-flex items-center gap-1">
                  <ZoomIn size={12} />
                  Tamanho do vídeo
                </span>
              </p>
              <span className="font-mono text-[11px] text-zinc-400">
                {Math.round(zoomDraft * 100)}%
                {savingZoom && <span className="ml-1 text-zinc-600">· salvando</span>}
              </span>
            </div>
            <input
              type="range"
              min={50}
              max={200}
              step={5}
              value={Math.round(zoomDraft * 100)}
              disabled={isBusy || !canAdjustBeforeRender}
              onChange={(e) => handleZoomChange(Number(e.target.value) / 100)}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-700 accent-brand-500 disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-500"
            />
            <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
              <span>Menor</span>
              <span>Maior</span>
            </div>
            {(zoomNeedsRender || isCreated) && (
              <p className="mt-1.5 text-[10px] text-amber-300">
                {isCreated
                  ? 'Prévia ao vivo — ajuste o zoom e clique em "Renderizar agora" para gerar o MP4.'
                  : 'Prévia ao vivo — clique em "Renderizar com novo zoom" para gerar o MP4.'}
              </p>
            )}
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

        <button
          type="button"
          onClick={() => setCaptionsModalOpen(true)}
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface-raised/40 px-3 py-2.5 text-left transition hover:border-brand-500/40 hover:bg-surface-raised/70"
        >
          <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-zinc-200">
            <Captions size={14} className="shrink-0 text-brand-400" />
            Ver legendas com timestamps
          </span>
          <span className="shrink-0 rounded-full bg-surface-raised px-2 py-0.5 font-mono text-[10px] text-zinc-500">
            {clipSegments.length > 0 ? `${clipSegments.length} trecho${clipSegments.length === 1 ? '' : 's'}` : '—'}
          </span>
        </button>

        <ClipCaptionsModal
          open={captionsModalOpen}
          onClose={() => setCaptionsModalOpen(false)}
          clipIndex={index}
          startTime={clip.startTime}
          endTime={clip.endTime}
          transcript={transcript}
        />

        {localError && <p className="text-xs text-red-400">{localError}</p>}

        <div className="mt-auto flex flex-col gap-2">
          {isReady ? (
            <>
              {zoomNeedsRender && (
                <button
                  onClick={handleRender}
                  disabled={isBusy}
                  className="btn-primary w-full justify-center !py-2 text-sm"
                >
                  <Play size={16} />
                  Renderizar com novo zoom
                </button>
              )}
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
