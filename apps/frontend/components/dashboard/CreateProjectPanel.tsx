'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link2, Loader2, Sparkles, Upload } from 'lucide-react';
import { projectsApi } from '@/services/api';

type Stage = 'idle' | 'creating' | 'uploading' | 'downloading' | 'processing';

const STAGE_LABEL: Record<Stage, string> = {
  idle: '',
  creating: 'Criando projeto…',
  uploading: 'Enviando vídeo…',
  downloading: 'Baixando vídeo da URL…',
  processing: 'Processando com FFmpeg…',
};

const POLL_MS = 800;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

export function CreateProjectPanel() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);

  const busy = stage !== 'idle';

  async function waitUntilReady(projectId: string) {
    const started = Date.now();
    while (Date.now() - started < POLL_TIMEOUT_MS) {
      const project = await projectsApi.get(projectId);
      if (project.status === 'completed' && project.originalFile) {
        return project;
      }
      if (project.status === 'failed') {
        throw new Error(project.errorMessage || 'Falha ao processar o vídeo');
      }
      if (project.status === 'downloading') setStage('downloading');
      else if (project.status === 'processing') setStage('processing');
      await sleep(POLL_MS);
    }
    throw new Error('Tempo esgotado ao processar o vídeo. Abra o projeto e tente novamente.');
  }

  async function handleCreateFromUrl() {
    if (!url.trim()) return;
    setError(null);
    setStage('creating');
    try {
      const project = await projectsApi.create({
        name: guessNameFromUrl(url),
        sourceType: 'url',
        sourceUrl: url.trim(),
      });
      setStage('downloading');
      await waitUntilReady(project.id);
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar projeto');
      setStage('idle');
    }
  }

  async function handleFileSelected(file: File) {
    setError(null);
    setStage('creating');
    try {
      const project = await projectsApi.create({
        name: file.name.replace(/\.[^./]+$/, ''),
        sourceType: 'upload',
      });

      setStage('uploading');
      await projectsApi.upload(project.id, file);
      setStage('processing');
      // upload já finaliza com metadata; se ainda processing, faz poll
      await waitUntilReady(project.id);

      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar vídeo');
      setStage('idle');
    }
  }

  return (
    <section className="card p-8">
      <div className="mx-auto flex max-w-xl flex-col items-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600/15 text-brand-400">
          <Sparkles size={22} />
        </div>
        <h2 className="text-lg font-semibold text-white">Criar novo projeto</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Cole uma URL (arquivo direto ou YouTube com yt-dlp) ou envie um vídeo do seu computador
        </p>

        <div className="mt-6 w-full">
          <div className="relative">
            <Link2 className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
            <input
              type="url"
              placeholder="https://..."
              value={url}
              disabled={busy}
              onChange={(e) => setUrl(e.target.value)}
              className="input pl-10"
            />
          </div>

          <button
            onClick={handleCreateFromUrl}
            disabled={busy || !url.trim()}
            className="btn-primary mt-3 w-full"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : null}
            Processar vídeo
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-zinc-600">
            <div className="h-px flex-1 bg-surface-border" />
            ou
            <div className="h-px flex-1 bg-surface-border" />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/x-matroska,video/webm,video/x-msvideo,.mp4,.mov,.mkv,.webm,.avi"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelected(file);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="btn-secondary w-full"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            Fazer upload
          </button>

          {busy && <p className="mt-3 text-xs text-brand-300">{STAGE_LABEL[stage]}</p>}
          {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
        </div>
      </div>
    </section>
  );
}

function guessNameFromUrl(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    const lastSegment = pathname.split('/').filter(Boolean).pop();
    return lastSegment ? `${hostname} — ${decodeURIComponent(lastSegment)}` : hostname;
  } catch {
    return 'Novo projeto';
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
