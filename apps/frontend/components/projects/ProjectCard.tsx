'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Film, Trash2 } from 'lucide-react';
import { projectsApi } from '@/services/api';
import { PROJECT_STATUS_COLOR, PROJECT_STATUS_LABEL, cn, formatTime } from '@/lib/utils';
import type { Project } from '@/types';

interface ProjectCardProps {
  project: Project;
  onDelete?: (project: Project) => void;
}

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const hasThumbnail = !!project.thumbnailFile && !thumbFailed;

  return (
    <Link
      href={`/projects/${project.id}`}
      className="card group relative overflow-hidden transition-colors hover:border-brand-600/60"
    >
      {onDelete && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(project);
          }}
          className="absolute right-2 top-2 z-10 rounded-lg bg-black/60 p-1.5 text-zinc-300 opacity-0 transition-opacity hover:bg-red-600/80 hover:text-white group-hover:opacity-100"
          title="Excluir projeto"
        >
          <Trash2 size={14} />
        </button>
      )}

      <div className="relative aspect-video w-full bg-surface-raised">
        {hasThumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={projectsApi.thumbnailUrl(project.id)}
            alt={project.name}
            className="h-full w-full object-cover"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-700">
            <Film size={28} />
          </div>
        )}

        {project.duration ? (
          <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
            {formatTime(project.duration)}
          </span>
        ) : null}
      </div>

      <div className="p-4">
        <p className="truncate text-sm font-medium text-zinc-100" title={project.name}>
          {project.name}
        </p>
        <div className="mt-2 flex items-center justify-between">
          <span className={cn('badge', PROJECT_STATUS_COLOR[project.status])}>
            {PROJECT_STATUS_LABEL[project.status]}
          </span>
          <span className="text-[11px] uppercase tracking-wide text-zinc-600">
            {project.sourceType === 'upload' ? 'Upload' : 'URL'}
          </span>
        </div>
      </div>
    </Link>
  );
}
