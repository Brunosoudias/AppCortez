'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Trash2, XCircle } from 'lucide-react';
import { jobsApi } from '@/services/api';
import { useToast } from '@/components/layout/ToastProvider';
import { cn } from '@/lib/utils';
import type { Job } from '@/types';

const JOB_LABEL: Record<string, string> = {
  transcribe: 'Transcrição',
  analyze: 'Análise IA',
  'auto-clips': 'Cortes automáticos',
  render: 'Render',
  'export-batch': 'Exportação em lote',
  download: 'Download',
  'burn-captions': 'Burn-in legendas',
};

export default function JobsPage() {
  const { push } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ queued: number; running: number; failedRecent: number; total: number } | null>(
    null,
  );

  const refresh = useCallback(async () => {
    try {
      const [list, summary] = await Promise.all([jobsApi.list(), jobsApi.stats()]);
      setJobs(list);
      setStats(summary);
    } catch (err) {
      push({ kind: 'error', title: 'Falha ao carregar jobs', description: String(err) });
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 2000);
    return () => clearInterval(t);
  }, [refresh]);

  async function handleCancel(id: string, type?: string) {
    try {
      await jobsApi.cancel(id);
      push({
        kind: 'info',
        title: type === 'auto-clips' ? 'Cortes cancelados' : 'Job cancelado',
        description: 'O processamento será interrompido em breve.',
      });
      await refresh();
    } catch (err) {
      push({ kind: 'error', title: 'Não foi possível cancelar', description: String(err) });
    }
  }

  async function handleClear() {
    try {
      const res = await jobsApi.clearFinished();
      push({ kind: 'success', title: 'Fila limpa', description: `${res.cleared} jobs removidos` });
      await refresh();
    } catch (err) {
      push({ kind: 'error', title: 'Falha ao limpar', description: String(err) });
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-brand-400">Fila</p>
          <h1 className="mt-1 text-2xl font-semibold text-white">Jobs de processamento</h1>
          <p className="mt-1 text-sm text-zinc-500">Transcrição, IA, render, legendas e exportações</p>
        </div>
        <button onClick={() => void handleClear()} className="btn-secondary !py-1.5 text-xs">
          <Trash2 size={14} /> Limpar finalizados
        </button>
      </header>

      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Na fila" value={stats.queued} />
          <Stat label="Rodando" value={stats.running} />
          <Stat label="Falhas (24h)" value={stats.failedRecent} />
          <Stat label="Total" value={stats.total} />
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center gap-2 text-sm text-zinc-500">
          <Loader2 size={16} className="animate-spin" /> Carregando…
        </div>
      ) : jobs.length === 0 ? (
        <div className="card py-16 text-center text-sm text-zinc-500">Nenhum job registrado ainda.</div>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <div key={job.id} className="card flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-100">{JOB_LABEL[job.type] ?? job.type}</p>
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  {job.message || job.errorMessage || '—'}
                  {job.projectId ? ` · projeto ${job.projectId.slice(0, 8)}…` : ''}
                </p>
                {(job.status === 'running' || job.status === 'queued') && (
                  <div className="mt-2 h-1.5 max-w-xs overflow-hidden rounded-full bg-surface-raised">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-[width]"
                      style={{ width: `${Math.max(job.progress, job.status === 'queued' ? 2 : 4)}%` }}
                    />
                  </div>
                )}
              </div>
              <span
                className={cn(
                  'badge',
                  job.status === 'completed' && 'bg-emerald-500/15 text-emerald-300',
                  job.status === 'failed' && 'bg-red-500/15 text-red-300',
                  job.status === 'running' && 'bg-brand-500/15 text-brand-300',
                  job.status === 'queued' && 'bg-zinc-500/15 text-zinc-300',
                  job.status === 'cancelled' && 'bg-zinc-500/15 text-zinc-400',
                )}
              >
                {job.status}
                {job.status === 'running' ? ` ${job.progress}%` : ''}
              </span>
              {job.status === 'queued' || job.status === 'running' ? (
                <button
                  onClick={() => void handleCancel(job.id, job.type)}
                  className="btn-secondary !py-1.5 text-xs text-red-300 hover:text-red-200"
                >
                  <XCircle size={14} />
                  {job.type === 'auto-clips' ? 'Cancelar cortes' : 'Cancelar'}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}
