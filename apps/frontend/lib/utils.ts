export { formatTime, parseTimeToSeconds } from '@ai-video-cutter/shared-utils';
import type { ClipStatus, ProjectStatus } from '@ai-video-cutter/shared-types';

/** Combina classes condicionalmente sem depender de bibliotecas externas. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  created: 'Criado',
  downloading: 'Baixando',
  processing: 'Processando',
  analyzing: 'Analisando',
  completed: 'Pronto',
  failed: 'Falhou',
};

export const PROJECT_STATUS_COLOR: Record<ProjectStatus, string> = {
  created: 'bg-zinc-500/15 text-zinc-300',
  downloading: 'bg-sky-500/15 text-sky-300',
  processing: 'bg-amber-500/15 text-amber-300',
  analyzing: 'bg-brand-500/15 text-brand-300',
  completed: 'bg-emerald-500/15 text-emerald-300',
  failed: 'bg-red-500/15 text-red-300',
};

export const CLIP_STATUS_LABEL: Record<ClipStatus, string> = {
  created: 'Criado',
  processing: 'Renderizando',
  completed: 'Pronto',
  failed: 'Falhou',
};

export const CLIP_STATUS_COLOR: Record<ClipStatus, string> = {
  created: 'bg-zinc-500/15 text-zinc-300',
  processing: 'bg-amber-500/15 text-amber-300',
  completed: 'bg-emerald-500/15 text-emerald-300',
  failed: 'bg-red-500/15 text-red-300',
};
