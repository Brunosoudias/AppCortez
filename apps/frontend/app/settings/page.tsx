'use client';

import { useEffect, useState } from 'react';
import { Info, Loader2, RefreshCw, Save, Trash2 } from 'lucide-react';
import { healthApi, settingsApi } from '@/services/api';
import { useToast } from '@/components/layout/ToastProvider';
import type {
  AppSettings,
  CaptionStyle,
  ClipAspectRatio,
  SystemHealth,
  UpdateAppSettingsPayload,
  WhisperMode,
} from '@/types';
import { CAPTION_STYLE_LABELS } from '@/types';

export default function SettingsPage() {
  const { push } = useToast();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([settingsApi.get(), healthApi.system().catch(() => null)])
      .then(([s, h]) => {
        setSettings(s);
        setHealth(h);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Falha ao carregar'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const payload: UpdateAppSettingsPayload = {
        language: settings.language,
        whisperMode: settings.whisperMode,
        whisperCliPath: settings.whisperCliPath,
        defaultClipFormat: settings.defaultClipFormat,
        defaultClipDuration: settings.defaultClipDuration,
        maxAutoClips: settings.maxAutoClips,
        faceTrackingEnabled: settings.faceTrackingEnabled,
        burnCaptionsByDefault: settings.burnCaptionsByDefault,
        captionStyle: settings.captionStyle,
      };
      const updated = await settingsApi.update(payload);
      setSettings(updated);
      push({ kind: 'success', title: 'Configurações salvas' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar';
      setError(msg);
      push({ kind: 'error', title: 'Falha ao salvar', description: msg });
    } finally {
      setSaving(false);
    }
  }

  async function refreshHealth() {
    setChecking(true);
    try {
      const h = await healthApi.system();
      setHealth(h);
      push({
        kind: h.status === 'ok' ? 'success' : 'error',
        title: h.status === 'ok' ? 'Sistema OK' : 'Sistema degradado',
        description: `FFmpeg ${h.binaries.find((b) => b.name === 'ffmpeg')?.available ? 'ok' : 'ausente'}`,
      });
    } catch (err) {
      push({ kind: 'error', title: 'Health check falhou', description: String(err) });
    } finally {
      setChecking(false);
    }
  }

  async function handleCleanup() {
    setCleaning(true);
    try {
      const result = await healthApi.cleanup(true);
      push({
        kind: 'success',
        title: 'Limpeza concluída',
        description: `${result.deletedTempFiles} temp · ${result.clearedJobs} jobs · ~${formatBytes(result.freedApproxBytes)}`,
      });
      await refreshHealth();
    } catch (err) {
      push({ kind: 'error', title: 'Falha na limpeza', description: String(err) });
    } finally {
      setCleaning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-sm text-zinc-500">
        <Loader2 size={16} className="animate-spin" /> Carregando…
      </div>
    );
  }

  if (!settings) {
    return <p className="p-10 text-sm text-red-400">{error ?? 'Sem configurações'}</p>;
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wider text-brand-400">AI Video Cutter</p>
        <h1 className="mt-1 text-2xl font-semibold text-white">Configurações</h1>
      </header>

      <section className="card space-y-3 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Saúde do sistema</h2>
          <button onClick={() => void refreshHealth()} disabled={checking} className="btn-secondary !py-1.5 text-xs">
            {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Verificar
          </button>
        </div>
        {health ? (
          <>
            <p className={`text-xs ${health.status === 'ok' ? 'text-emerald-400' : 'text-amber-400'}`}>
              Status: {health.status} · temp: {health.tempFileCount} · fila: {health.jobsQueued}/
              {health.jobsRunning}
            </p>
            <ul className="space-y-1.5 text-xs">
              {health.binaries.map((b) => (
                <li key={b.name} className="flex items-center justify-between gap-3">
                  <span className="font-mono text-zinc-400">{b.name}</span>
                  <span className={b.available ? 'text-emerald-400' : 'text-red-400'}>
                    {b.available ? 'ok' : 'ausente'}
                    {b.detail ? ` · ${b.detail.slice(0, 40)}` : ''}
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3">
                <span className="text-zinc-400">OpenAI</span>
                <span className={health.openaiConfigured ? 'text-emerald-400' : 'text-amber-400'}>
                  {health.openaiConfigured ? 'configurada' : 'não configurada'}
                </span>
              </li>
            </ul>
          </>
        ) : (
          <p className="text-xs text-zinc-500">Clique em Verificar para diagnosticar binários.</p>
        )}
        <button onClick={() => void handleCleanup()} disabled={cleaning} className="btn-secondary mt-2 !py-1.5 text-xs">
          {cleaning ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          Limpar temp + jobs finalizados
        </button>
      </section>

      <section className="card mt-4 space-y-4 p-6">
        <h2 className="text-sm font-semibold text-zinc-200">IA &amp; Whisper</h2>

        <Field label="Idioma (Whisper)">
          <select
            className="input"
            value={settings.language.startsWith('pt') ? 'pt-BR' : settings.language}
            onChange={(e) => setSettings({ ...settings, language: e.target.value })}
          >
            <option value="pt-BR">Português (Brasil)</option>
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="auto">auto (detectar)</option>
          </select>
        </Field>

        <Field label="Modo Whisper">
          <select
            className="input"
            value={settings.whisperMode}
            onChange={(e) => setSettings({ ...settings, whisperMode: e.target.value as WhisperMode })}
          >
            <option value="auto">auto (OpenAI → FFmpeg Whisper → CLI → heurística)</option>
            <option value="openai">openai</option>
            <option value="ffmpeg">ffmpeg (whisper.cpp local)</option>
            <option value="cli">cli</option>
            <option value="heuristic">heuristic</option>
          </select>
        </Field>

        <Field label="Caminho Whisper CLI">
          <input
            className="input font-mono text-xs"
            value={settings.whisperCliPath}
            onChange={(e) => setSettings({ ...settings, whisperCliPath: e.target.value })}
          />
        </Field>

        <div className="flex items-center justify-between rounded-lg bg-surface-raised px-3 py-2 text-sm">
          <span className="text-zinc-500">OPENAI_API_KEY</span>
          <span className={settings.openaiConfigured ? 'text-emerald-400' : 'text-amber-400'}>
            {settings.openaiConfigured ? 'configurada' : 'não configurada (.env)'}
          </span>
        </div>
      </section>

      <section className="card mt-4 space-y-4 p-6">
        <h2 className="text-sm font-semibold text-zinc-200">Cortes automáticos</h2>

        <Field label="Formato padrão">
          <select
            className="input"
            value={settings.defaultClipFormat}
            onChange={(e) =>
              setSettings({ ...settings, defaultClipFormat: e.target.value as ClipAspectRatio })
            }
          >
            <option value="9:16">9:16</option>
            <option value="16:9">16:9</option>
            <option value="1:1">1:1</option>
          </select>
        </Field>

        <Field label="Duração alvo (s)">
          <input
            type="number"
            className="input"
            min={10}
            max={120}
            value={settings.defaultClipDuration}
            onChange={(e) => setSettings({ ...settings, defaultClipDuration: Number(e.target.value) })}
          />
        </Field>

        <Field label="Máx. clips automáticos">
          <input
            type="number"
            className="input"
            min={1}
            max={20}
            value={settings.maxAutoClips}
            onChange={(e) => setSettings({ ...settings, maxAutoClips: Number(e.target.value) })}
          />
        </Field>

        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-zinc-400">Face tracking no crop vertical</span>
          <input
            type="checkbox"
            checked={settings.faceTrackingEnabled}
            onChange={(e) => setSettings({ ...settings, faceTrackingEnabled: e.target.checked })}
          />
        </label>

        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-zinc-400">Burn-in de legendas por padrão</span>
          <input
            type="checkbox"
            checked={settings.burnCaptionsByDefault}
            onChange={(e) => setSettings({ ...settings, burnCaptionsByDefault: e.target.checked })}
          />
        </label>

        <Field label="Estilo de legenda ASS">
          <select
            className="input"
            value={settings.captionStyle ?? 'reels'}
            onChange={(e) => setSettings({ ...settings, captionStyle: e.target.value as CaptionStyle })}
          >
            {(Object.keys(CAPTION_STYLE_LABELS) as CaptionStyle[]).map((k) => (
              <option key={k} value={k}>
                {CAPTION_STYLE_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
      </section>

      <section className="card mt-4 p-6">
        <h2 className="text-sm font-semibold text-zinc-200">Binários (.env)</h2>
        <dl className="mt-3 space-y-2 text-xs text-zinc-500">
          <div className="flex justify-between gap-4">
            <dt>FFmpeg</dt>
            <dd className="truncate font-mono text-zinc-300">{settings.ffmpegPath}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>FFprobe</dt>
            <dd className="truncate font-mono text-zinc-300">{settings.ffprobePath}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>yt-dlp</dt>
            <dd className="truncate font-mono text-zinc-300">{settings.ytDlpPath}</dd>
          </div>
        </dl>
      </section>

      <div className="mt-6 flex items-center gap-3">
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Salvar
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      <section className="card mt-6 flex gap-3 p-6">
        <Info size={18} className="mt-0.5 shrink-0 text-brand-400" />
        <p className="text-sm text-zinc-400">
          Segredos ficam no <code className="rounded bg-surface-raised px-1 py-0.5 text-xs">.env</code>. Preferências em{' '}
          <code className="rounded bg-surface-raised px-1 py-0.5 text-xs">storage/settings.json</code>. Jobs em{' '}
          <code className="rounded bg-surface-raised px-1 py-0.5 text-xs">storage/jobs.json</code>.
        </p>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
