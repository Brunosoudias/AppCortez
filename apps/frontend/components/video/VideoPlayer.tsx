'use client';

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { Pause, Play, RotateCcw, RotateCw } from 'lucide-react';
import { formatTime } from '@/lib/utils';

interface VideoPlayerProps {
  src: string;
  videoRef: RefObject<HTMLVideoElement>;
  currentTime: number;
  duration: number;
  playing: boolean;
  /** Clique/arraste na barra para ir a um momento do vídeo */
  onSeek?: (time: number) => void;
  /** Marcações de corte manual (início/fim) */
  startMark?: number | null;
  endMark?: number | null;
  /** Texto da legenda ativa (overlay) */
  captionText?: string | null;
  /** Guia 9:16 — centro horizontal 0–1 */
  cropGuideX?: number | null;
  showCropGuide?: boolean;
  /** Permite arrastar o guia para ajustar o enquadramento */
  cropGuideEditable?: boolean;
  onCropGuideChange?: (x: number) => void;
  /** Segundo guia (painel de baixo no layout stack) */
  cropGuideXBottom?: number | null;
  onCropGuideBottomChange?: (x: number) => void;
  /** Mostra o guia do painel inferior (layout dois painéis) */
  showBottomGuide?: boolean;
}

const SKIP_SECONDS = 5;
const GUIDE_WIDTH = 0.28; // fração da largura do player (~9:16 sobre 16:9)

export function VideoPlayer({
  src,
  videoRef,
  currentTime,
  duration,
  playing,
  onSeek,
  startMark = null,
  endMark = null,
  captionText,
  cropGuideX,
  showCropGuide,
  cropGuideEditable = true,
  onCropGuideChange,
  cropGuideXBottom,
  onCropGuideBottomChange,
  showBottomGuide = true,
}: VideoPlayerProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'top' | 'bottom' | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);

  const displayTime = scrubTime ?? currentTime;
  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (displayTime / duration) * 100)) : 0;
  const pct = (t: number) => (duration ? `${Math.min(100, Math.max(0, (t / duration) * 100))}%` : '0%');

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const track = progressRef.current;
      if (!track || !duration) return null;
      const rect = track.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration],
  );

  function onProgressPointerDown(e: ReactPointerEvent) {
    if (!onSeek || !duration) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setScrubbing(true);
    const t = seekFromClientX(e.clientX);
    if (t !== null) setScrubTime(t);
  }

  function onProgressPointerMove(e: ReactPointerEvent) {
    if (!scrubbing) return;
    const t = seekFromClientX(e.clientX);
    if (t !== null) setScrubTime(t);
  }

  function finishScrub(e: ReactPointerEvent) {
    if (!scrubbing) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const t = scrubTime ?? seekFromClientX(e.clientX);
    if (t !== null) onSeek?.(t);
    setScrubbing(false);
    setScrubTime(null);
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
  }

  function skip(delta: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(Math.max(0, video.currentTime + delta), video.duration || Infinity);
  }

  const clampX = useCallback((clientX: number) => {
    const stage = stageRef.current;
    if (!stage) return 0.5;
    const rect = stage.getBoundingClientRect();
    const half = GUIDE_WIDTH / 2;
    const raw = (clientX - rect.left) / Math.max(1, rect.width);
    return Math.min(1 - half, Math.max(half, raw));
  }, []);

  function onPointerDown(which: 'top' | 'bottom', e: ReactPointerEvent) {
    if (!cropGuideEditable) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(which);
    const x = clampX(e.clientX);
    if (which === 'top') onCropGuideChange?.(x);
    else onCropGuideBottomChange?.(x);
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!dragging) return;
    const x = clampX(e.clientX);
    if (dragging === 'top') onCropGuideChange?.(x);
    else onCropGuideBottomChange?.(x);
  }

  function onPointerUp(e: ReactPointerEvent) {
    if (!dragging) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setDragging(null);
  }

  const topX = typeof cropGuideX === 'number' ? cropGuideX : 0.5;
  const bottomX = typeof cropGuideXBottom === 'number' ? cropGuideXBottom : Math.min(0.85, topX + 0.18);
  const showBottom = showCropGuide && showBottomGuide && typeof onCropGuideBottomChange === 'function';

  return (
    <div className="card overflow-hidden">
      <div
        ref={stageRef}
        className="relative flex aspect-video w-full items-center justify-center bg-black"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <video ref={videoRef} src={src} className="h-full w-full" />

        {showCropGuide && (
          <>
            {/* Escurece laterais fora do guia principal */}
            <div
              className="pointer-events-none absolute inset-y-0 left-0 bg-black/45"
              style={{ width: `calc(${topX * 100}% - ${GUIDE_WIDTH * 50}%)` }}
            />
            <div
              className="pointer-events-none absolute inset-y-0 right-0 bg-black/45"
              style={{ width: `calc(${(1 - topX) * 100}% - ${GUIDE_WIDTH * 50}%)` }}
            />

            <div
              className={`absolute top-0 h-full border-2 border-brand-400 bg-brand-500/10 ${
                cropGuideEditable ? 'cursor-ew-resize touch-none' : 'pointer-events-none'
              } ${dragging === 'top' ? 'border-brand-300 bg-brand-400/20' : ''}`}
              style={{
                width: `${GUIDE_WIDTH * 100}%`,
                left: `${topX * 100}%`,
                transform: 'translateX(-50%)',
              }}
              onPointerDown={(e) => onPointerDown('top', e)}
              title="Arraste para ajustar o enquadramento (painel de cima)"
            >
              <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-brand-300/80" />
              <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-medium text-white shadow">
                {showBottom ? 'Cima' : '9:16'} · {(topX * 100).toFixed(0)}%
              </div>
              {cropGuideEditable && (
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1">
                  <span className="h-8 w-1.5 rounded-full bg-white/80" />
                  <span className="h-8 w-1.5 rounded-full bg-white/80" />
                </div>
              )}
            </div>

            {showBottom && (
              <div
                className={`absolute bottom-0 h-[42%] border-2 border-dashed border-emerald-400/80 bg-emerald-500/10 ${
                  cropGuideEditable ? 'cursor-ew-resize touch-none' : 'pointer-events-none'
                } ${dragging === 'bottom' ? 'border-emerald-300 bg-emerald-400/20' : ''}`}
                style={{
                  width: `${GUIDE_WIDTH * 100}%`,
                  left: `${bottomX * 100}%`,
                  transform: 'translateX(-50%)',
                }}
                onPointerDown={(e) => onPointerDown('bottom', e)}
                title="Arraste para ajustar o painel de baixo"
              >
                <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-medium text-white shadow">
                  Baixo · {(bottomX * 100).toFixed(0)}%
                </div>
              </div>
            )}
          </>
        )}

        {captionText ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center px-6">
            <p className="max-w-[90%] rounded-lg bg-black/75 px-4 py-2 text-center text-sm font-semibold leading-snug text-white shadow-lg sm:text-base">
              {captionText}
            </p>
          </div>
        ) : null}
      </div>

      <div className="space-y-2 border-t border-surface-border px-4 py-3">
        <div
          ref={progressRef}
          role="slider"
          aria-label="Posição no vídeo"
          aria-valuemin={0}
          aria-valuemax={duration || 0}
          aria-valuenow={displayTime}
          aria-valuetext={`${formatTime(displayTime)} de ${formatTime(duration)}`}
          className={`group relative h-2 w-full rounded-full bg-surface-raised ${onSeek ? 'cursor-pointer touch-none' : 'pointer-events-none'}`}
          onPointerDown={onProgressPointerDown}
          onPointerMove={onProgressPointerMove}
          onPointerUp={finishScrub}
          onPointerCancel={finishScrub}
        >
          {startMark !== null && endMark !== null && endMark > startMark && (
            <div
              className="pointer-events-none absolute inset-y-0 rounded-full bg-brand-600/35"
              style={{ left: pct(startMark), width: `calc(${pct(endMark)} - ${pct(startMark)})` }}
            />
          )}

          <div
            className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-brand-500 transition-[width] duration-75 ease-linear"
            style={{ width: `${progressPct}%` }}
          />

          <div
            className={`pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${
              onSeek ? 'group-hover:scale-110' : ''
            } ${scrubbing ? 'scale-125 ring-2 ring-brand-400' : ''}`}
            style={{ left: `${progressPct}%` }}
          />

          {startMark !== null && (
            <div
              className="pointer-events-none absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400"
              style={{ left: pct(startMark) }}
              title={`Início: ${formatTime(startMark)}`}
            />
          )}

          {endMark !== null && (
            <div
              className="pointer-events-none absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-400"
              style={{ left: pct(endMark) }}
              title={`Fim: ${formatTime(endMark)}`}
            />
          )}
        </div>

        <div className="flex justify-between font-mono text-[11px] text-zinc-500">
          <span>{formatTime(displayTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="flex items-center gap-4 border-t border-surface-border px-4 py-3">
        <button onClick={() => skip(-SKIP_SECONDS)} className="btn-ghost !px-2" title="Voltar 5s">
          <RotateCcw size={18} />
        </button>

        <button onClick={togglePlay} className="btn-primary !h-10 !w-10 !rounded-full !p-0">
          {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
        </button>

        <button onClick={() => skip(SKIP_SECONDS)} className="btn-ghost !px-2" title="Avançar 5s">
          <RotateCw size={18} />
        </button>
      </div>

      {showCropGuide && cropGuideEditable && (
        <div className="space-y-2 border-t border-surface-border px-4 py-3">
          <label className="flex items-center gap-3 text-xs text-zinc-400">
            <span className="w-28 shrink-0 text-zinc-300">Enquadramento{showBottom ? ' (cima)' : ''}</span>
            <input
              type="range"
              min={GUIDE_WIDTH * 50}
              max={100 - GUIDE_WIDTH * 50}
              step={0.5}
              value={topX * 100}
              onChange={(e) => onCropGuideChange?.(Number(e.target.value) / 100)}
              className="w-full accent-brand-500"
            />
            <span className="w-10 font-mono text-zinc-500">{(topX * 100).toFixed(0)}%</span>
          </label>
          {showBottom && (
            <label className="flex items-center gap-3 text-xs text-zinc-400">
              <span className="w-28 shrink-0 text-zinc-300">Painel de baixo</span>
              <input
                type="range"
                min={GUIDE_WIDTH * 50}
                max={100 - GUIDE_WIDTH * 50}
                step={0.5}
                value={bottomX * 100}
                onChange={(e) => onCropGuideBottomChange?.(Number(e.target.value) / 100)}
                className="w-full accent-emerald-500"
              />
              <span className="w-10 font-mono text-zinc-500">{(bottomX * 100).toFixed(0)}%</span>
            </label>
          )}
          <p className="text-[11px] text-zinc-600">
            Arraste as faixas no vídeo ou use os sliders. O enquadramento é aplicado no render 9:16.
          </p>
        </div>
      )}
    </div>
  );
}
