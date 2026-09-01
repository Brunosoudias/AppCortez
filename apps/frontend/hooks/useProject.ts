'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { projectsApi } from '@/services/api';
import type { Project } from '@/types';

const POLL_MS = 800;

export function useProject(id: string) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await projectsApi.get(id);
      setProject(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar projeto');
      return null;
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    stopPolling();
    const needsPoll =
      project &&
      (project.status === 'downloading' || project.status === 'processing') &&
      !project.originalFile;

    if (!needsPoll) return;

    timerRef.current = setInterval(async () => {
      try {
        const data = await projectsApi.get(id);
        setProject(data);
        if (data.status === 'completed' || data.status === 'failed') {
          stopPolling();
        }
      } catch {
        stopPolling();
      }
    }, POLL_MS);

    return stopPolling;
  }, [id, project?.status, project?.originalFile, stopPolling]);

  const retryDownload = useCallback(async () => {
    const updated = await projectsApi.download(id);
    setProject(updated);
    return updated;
  }, [id]);

  return { project, loading, error, refetch, retryDownload };
}
