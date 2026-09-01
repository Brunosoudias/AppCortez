'use client';

import Link from 'next/link';
import { FolderKanban, Loader2, Plus } from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { projectsApi } from '@/services/api';
import type { Project } from '@/types';

export default function ProjectsPage() {
  const { projects, loading, error, refetch } = useProjects();

  async function handleDelete(project: Project) {
    if (!confirm(`Excluir o projeto "${project.name}"? Isso apaga também os arquivos em storage/.`)) return;
    try {
      await projectsApi.delete(project.id);
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao excluir projeto');
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-brand-400">AI Video Cutter</p>
          <h1 className="mt-1 text-2xl font-semibold text-white">Projetos</h1>
        </div>
        <Link href="/" className="btn-primary">
          <Plus size={16} /> Novo projeto
        </Link>
      </header>

      {loading && (
        <div className="flex items-center gap-2 py-12 text-sm text-zinc-500">
          <Loader2 size={16} className="animate-spin" /> Carregando projetos…
        </div>
      )}

      {error && <p className="py-12 text-sm text-red-400">{error}</p>}

      {!loading && !error && projects.length === 0 && (
        <div className="card flex flex-col items-center gap-3 py-16 text-center">
          <FolderKanban size={28} className="text-zinc-600" />
          <p className="text-sm text-zinc-500">Nenhum projeto ainda.</p>
          <Link href="/" className="btn-primary">
            <Plus size={16} /> Criar o primeiro projeto
          </Link>
        </div>
      )}

      {projects.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
