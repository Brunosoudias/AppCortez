'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ListTodo, Loader2, X } from 'lucide-react';
import { jobsApi } from '@/services/api';
import { useToast } from '@/components/layout/ToastProvider';
import type { Job } from '@/types';

const JOB_LABEL: Record<string, string> = {
  transcribe: 'Transcrição',
  analyze: 'Análise IA',
  'auto-clips': 'Cortes auto',
  render: 'Render',
  'export-batch': 'Exportação',
  download: 'Download',
  'burn-captions': 'Legendas',
};

export function JobsStatusBar() {
  const { push } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [open, setOpen] = useState(false);
  const seen = useState(() => new Set<string>())[0];

  const refresh = useCallback(async () => {
    try {
      const list = await jobsApi.list();
      setJobs(list.slice(0, 30));

      for (const job of list) {
        if (job.status !== 'completed' && job.status !== 'failed') continue;
        const key = `${job.id}:${job.status}`;
        if (seen.has(key)) continue;
        // só notifica jobs recentes (< 2 min)
        if (Date.now() - new Date(job.updatedAt).getTime() > 120_000) {
          seen.add(key);
          continue;
        }
        seen.add(key);
        push({
          kind: job.status === 'completed' ? 'success' : 'error',
          title: JOB_LABEL[job.type] ?? job.type,
          description: job.status === 'completed' ? job.message || 'Concluído' : job.errorMessage || 'Falhou',
        });
      }
    } catch {
      // ignore polling errors
    }
  }, [push, seen]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 2000);
    return () => clearInterval(t);
  }, [refresh]);

  const active = jobs.filter((j) => j.status === 'queued' || j.status === 'running');
  const running = active.find((j) => j.status === 'running');

  return (
    <div className="relative border-b border-surface-border bg-surface-panel/80 px-4 py-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200"
        >
          {running ? <Loader2 size={14} className="animate-spin text-brand-400" /> : <ListTodo size={14} />}
          {active.length > 0 ? (
            <span>
              {active.length} job{active.length > 1 ? 's' : ''} na fila
              {running ? ` · ${JOB_LABEL[running.type] ?? running.type} ${running.progress}%` : ''}
            </span>
          ) : (
            <span>Fila ociosa</span>
          )}
        </button>
        <Link href="/jobs" className="ml-auto text-xs text-brand-300 hover:underline">
          Ver todos
        </Link>
      </div>

      {running && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-raised">
          <div
            className="h-full rounded-full bg-brand-500 transition-[width] duration-300"
            style={{ width: `${Math.max(running.progress, 4)}%` }}
          />
        </div>
      )}

      {open && (
        <div className="absolute left-4 right-4 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-lg border border-surface-border bg-surface-panel p-2 shadow-xl">
          <div className="mb-1 flex items-center justify-between px-2 py-1">
            <p className="text-xs font-medium text-zinc-300">Jobs recentes</p>
            <button type="button" onClick={() => setOpen(false)} className="text-zinc-500 hover:text-zinc-300">
              <X size={14} />
            </button>
          </div>
          {jobs.length === 0 ? (
            <p className="px-2 py-3 text-xs text-zinc-500">Nenhum job ainda.</p>
          ) : (
            jobs.slice(0, 8).map((job) => (
              <div key={job.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-surface-raised">
                <span className="w-24 shrink-0 text-zinc-400">{JOB_LABEL[job.type] ?? job.type}</span>
                <span className="min-w-0 flex-1 truncate text-zinc-500">{job.message || job.errorMessage || '—'}</span>
                <span
                  className={
                    job.status === 'completed'
                      ? 'text-emerald-400'
                      : job.status === 'failed'
                        ? 'text-red-400'
                        : job.status === 'running'
                          ? 'text-brand-300'
                          : 'text-zinc-500'
                  }
                >
                  {job.status}
                  {job.status === 'running' ? ` ${job.progress}%` : ''}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
