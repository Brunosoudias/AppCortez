'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { clipsApi } from '@/services/api';
import type { Clip, ClipLayout, CreateClipPayload } from '@/types';

const POLL_MS = 600;

export function useClips(projectId: string) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await clipsApi.list(projectId);
      setClips(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar cortes');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    return () => {
      pollTimers.current.forEach((t) => clearInterval(t));
      pollTimers.current.clear();
    };
  }, []);

  const stopPolling = useCallback((clipId: string) => {
    const timer = pollTimers.current.get(clipId);
    if (timer) {
      clearInterval(timer);
      pollTimers.current.delete(clipId);
    }
  }, []);

  const startPolling = useCallback(
    (clipId: string) => {
      stopPolling(clipId);
      const timer = setInterval(async () => {
        try {
          const updated = await clipsApi.get(clipId);
          setClips((prev) => prev.map((c) => (c.id === clipId ? updated : c)));
          if (updated.status === 'completed' || updated.status === 'failed') {
            stopPolling(clipId);
          }
        } catch {
          stopPolling(clipId);
        }
      }, POLL_MS);
      pollTimers.current.set(clipId, timer);
    },
    [stopPolling],
  );

  // Retoma polling se a lista já tiver clips em processing (ex: refresh)
  useEffect(() => {
    for (const clip of clips) {
      if (clip.status === 'processing' && !pollTimers.current.has(clip.id)) {
        startPolling(clip.id);
      }
    }
  }, [clips, startPolling]);

  const createClip = useCallback(
    async (payload: CreateClipPayload) => {
      const clip = await clipsApi.create(projectId, payload);
      setClips((prev) => [clip, ...prev]);
      return clip;
    },
    [projectId],
  );

  const renderClip = useCallback(
    async (clipId: string) => {
      setClips((prev) =>
        prev.map((c) =>
          c.id === clipId ? { ...c, status: 'processing' as const, progress: 0, errorMessage: undefined } : c,
        ),
      );
      const updated = await clipsApi.render(clipId);
      setClips((prev) => prev.map((c) => (c.id === clipId ? updated : c)));
      if (updated.status === 'processing') {
        startPolling(clipId);
      }
      return updated;
    },
    [startPolling],
  );

  const deleteClip = useCallback(
    async (clipId: string) => {
      stopPolling(clipId);
      await clipsApi.delete(clipId);
      setClips((prev) => prev.filter((c) => c.id !== clipId));
    },
    [stopPolling],
  );

  const cancelClip = useCallback(
    async (clipId: string) => {
      stopPolling(clipId);
      const updated = await clipsApi.cancel(clipId);
      setClips((prev) => prev.map((c) => (c.id === clipId ? updated : c)));
      return updated;
    },
    [stopPolling],
  );

  const cancelPending = useCallback(async () => {
    const result = await clipsApi.cancelPending(projectId);
    await refetch();
    return result;
  }, [projectId, refetch]);

  const toggleCaptions = useCallback(
    async (clipId: string, enabled: boolean) => {
      const updated = await clipsApi.setCaptions(clipId, enabled);
      setClips((prev) => prev.map((c) => (c.id === clipId ? updated : c)));
      if (updated.status === 'processing') {
        startPolling(clipId);
      }
      return updated;
    },
    [startPolling],
  );

  const setClipLayout = useCallback(
    async (clipId: string, layout: ClipLayout) => {
      const updated = await clipsApi.setLayout(clipId, layout);
      setClips((prev) => prev.map((c) => (c.id === clipId ? updated : c)));
      if (updated.status === 'processing') {
        startPolling(clipId);
      }
      return updated;
    },
    [startPolling],
  );

  const updateClipText = useCallback(
    async (clipId: string, payload: { title?: string; titleCta?: string }) => {
      const updated = await clipsApi.updateText(clipId, { ...payload, rerender: true });
      setClips((prev) => prev.map((c) => (c.id === clipId ? updated : c)));
      if (updated.status === 'processing') {
        startPolling(clipId);
      }
      return updated;
    },
    [startPolling],
  );

  const setClipZoom = useCallback(
    async (clipId: string, centerZoom: number, rerender = false) => {
      const updated = await clipsApi.setZoom(clipId, centerZoom, rerender);
      setClips((prev) => prev.map((c) => (c.id === clipId ? updated : c)));
      if (updated.status === 'processing') {
        startPolling(clipId);
      }
      return updated;
    },
    [startPolling],
  );

  return {
    clips,
    loading,
    error,
    refetch,
    createClip,
    renderClip,
    deleteClip,
    cancelClip,
    cancelPending,
    toggleCaptions,
    setClipLayout,
    updateClipText,
    setClipZoom,
  };
}
