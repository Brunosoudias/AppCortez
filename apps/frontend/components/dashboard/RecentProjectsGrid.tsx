'use client';

import Link from 'next/link';
import { FolderKanban, Loader2 } from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { ProjectCard } from '@/components/projects/ProjectCard';

export function RecentProjectsGrid() {
  const { projects, loading, error } = useProjects();
  const recent = projects.slice(0, 6);

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-300">Projetos recentes</h3>
        {projects.length > 0 && (
          <Link href="/projects" className="text-xs text-brand-400 hover:text-brand-300">
            Ver todos →
          </Link>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-8 text-sm text-zinc-500">
          <Loader2 size={16} className="animate-spin" /> Carregando projetos…
        </div>
      )}

      {error && <p className="py-8 text-sm text-red-400">{error}</p>}

      {!loading && !error && recent.length === 0 && (
        <div className="card flex flex-col items-center gap-2 py-12 text-center">
          <FolderKanban size={24} className="text-zinc-600" />
          <p className="text-sm text-zinc-500">Nenhum projeto ainda. Crie o primeiro acima ↑</p>
        </div>
      )}

      {recent.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recent.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </section>
  );
}
