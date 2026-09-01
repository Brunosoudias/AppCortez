'use client';

import { useEffect, useRef, useState } from 'react';
import { Crosshair, Loader2, Lock, ScanFace, Unlock } from 'lucide-react';
import { projectsApi } from '@/services/api';

interface TrackPoint {
  time: number;
  x: number;
  secondaryX?: number;
}

interface FaceTrackPanelProps {
  projectId: string;
  currentTime: number;
  duration: number;
  enabled: boolean;
  cropGuideX: number;
  cropGuideXBottom: number;
  manualLock: boolean;
  onCropGuideX: (x: number) => void;
  onCropGuideBottom: (x: number) => void;
  onManualLockChange: (locked: boolean) => void;
  onApplyToClips?: () => Promise<void>;
  /** Limpa crop manual dos cortes para o render seguir o falante automaticamente */
  onFollowSpeakerOnClips?: () => Promise<void>;
}

export function FaceTrackPanel({
  projectId,
  currentTime,
  duration,
  enabled,
  cropGuideX,
  cropGuideXBottom,
  manualLock,
  onCropGuideX,
  onCropGuideBottom,
  onManualLockChange,
  onApplyToClips,
  onFollowSpeakerOnClips,
}: FaceTrackPanelProps) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [followSpeaker, setFollowSpeaker] = useState(true);
  const autoStarted = useRef(false);

  async function analyze(opts?: { quiet?: boolean }) {
    if (!duration || duration < 1) return;
    if (!opts?.quiet) setLoading(true);
    setError(null);
    try {
      const result = await projectsApi.faceTrack(projectId, 0, duration);
      const smoothed = (result.smoothed ?? []) as TrackPoint[];
      setPoints(smoothed);
      onManualLockChange(false);
      setFollowSpeaker(true);
      onCropGuideX(result.averageX);
      onCropGuideBottom(
        typeof result.averageSecondaryX === 'number'
          ? result.averageSecondaryX
          : Math.min(0.9, result.averageX + 0.2),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no face track');
    } finally {
      setLoading(false);
    }
  }

  // Auto-analisa ao abrir o projeto (seguir quem fala)
  useEffect(() => {
    if (!enabled || !duration || duration < 1 || autoStarted.current) return;
    autoStarted.current = true;
    void analyze({ quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, duration, projectId]);

  // Segue o falante no tempo atual
  useEffect(() => {
    if (!enabled || !points.length || manualLock || !followSpeaker) return;
    let x = points[0].x;
    let secondary = points[0].secondaryX ?? Math.min(0.9, x + 0.2);
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (currentTime >= a.time && currentTime <= b.time) {
        const t = (currentTime - a.time) / Math.max(0.001, b.time - a.time);
        x = a.x + (b.x - a.x) * t;
        const sa = a.secondaryX ?? a.x;
        const sb = b.secondaryX ?? b.x;
        secondary = sa + (sb - sa) * t;
        break;
      }
      if (currentTime > b.time) {
        x = b.x;
        secondary = b.secondaryX ?? b.x;
      }
    }
    onCropGuideX(x);
    onCropGuideBottom(secondary);
  }, [currentTime, points, enabled, followSpeaker, manualLock, onCropGuideX, onCropGuideBottom]);

  if (!enabled) {
    return (
      <div className="card p-5 text-sm text-zinc-500">
        Face tracking desativado nas configurações. Ative em Settings para seguir o rosto de quem fala.
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600/15 text-brand-400">
          <ScanFace size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-200">Seguir quem fala</p>
          <p className="mt-1 text-xs text-zinc-500">
            Detecta os rostos e centraliza o enquadramento em quem está falando (movimento da boca).
            O painel de baixo mostra o outro interlocutor.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => void analyze()} disabled={loading} className="btn-primary !py-1.5 text-xs">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Crosshair size={14} />}
              {points.length ? 'Reanalisar rostos' : 'Detectar falante'}
            </button>
            <button
              onClick={() => {
                const next = !followSpeaker;
                setFollowSpeaker(next);
                if (next) onManualLockChange(false);
              }}
              className="btn-secondary !py-1.5 text-xs"
            >
              {followSpeaker && !manualLock ? 'Seguindo…' : 'Ativar seguimento'}
            </button>
            <button
              onClick={() => onManualLockChange(!manualLock)}
              className="btn-secondary !py-1.5 text-xs"
            >
              {manualLock ? <Lock size={14} /> : <Unlock size={14} />}
              {manualLock ? 'Travado' : 'Travar manual'}
            </button>
            {onFollowSpeakerOnClips && (
              <button
                onClick={() => {
                  setApplying(true);
                  void onFollowSpeakerOnClips().finally(() => setApplying(false));
                }}
                disabled={applying}
                className="btn-secondary !py-1.5 text-xs"
                title="Remove crop fixo; no render o app segue o falante automaticamente"
              >
                {applying ? <Loader2 size={14} className="animate-spin" /> : null}
                Cortes: seguir falante
              </button>
            )}
            {onApplyToClips && (
              <button
                onClick={() => {
                  setApplying(true);
                  void onApplyToClips().finally(() => setApplying(false));
                }}
                disabled={applying}
                className="btn-secondary !py-1.5 text-xs"
              >
                Aplicar posição atual
              </button>
            )}
          </div>

          <p className="mt-2 font-mono text-xs text-zinc-500">
            falante X={cropGuideX.toFixed(3)} · outro X={cropGuideXBottom.toFixed(3)}
            {manualLock
              ? ' · manual'
              : followSpeaker && points.length
                ? ` · auto (${points.length} pts)`
                : ''}
          </p>
          {loading && (
            <p className="mt-2 flex items-center gap-2 text-xs text-brand-300">
              <Loader2 size={12} className="animate-spin" /> Analisando rostos no vídeo…
            </p>
          )}
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  );
}
