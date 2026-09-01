import type {
  ApiErrorResponse,
  AppSettings,
  AutoClipsPayload,
  Clip,
  CreateClipPayload,
  CreateProjectPayload,
  Job,
  Project,
  Transcript,
  TranscriptAnalysis,
  UpdateAppSettingsPayload,
  VideoInfo,
} from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let message = `Erro ${res.status}`;
    try {
      const body = (await res.json()) as ApiErrorResponse;
      message = Array.isArray(body.message) ? body.message.join(', ') : body.message ?? message;
    } catch {
      // resposta sem corpo JSON
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const projectsApi = {
  create: (payload: CreateProjectPayload) =>
    request<Project>('/projects', { method: 'POST', body: JSON.stringify(payload) }),

  list: () => request<Project[]>('/projects'),

  get: (id: string) => request<Project>(`/projects/${id}`),

  delete: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),

  upload: async (id: string, file: File): Promise<Project> => {
    const formData = new FormData();
    formData.append('file', file);
    return request<Project>(`/projects/${id}/upload`, { method: 'POST', body: formData });
  },

  download: (id: string) => request<Project>(`/projects/${id}/download`, { method: 'POST' }),

  transcribe: (id: string) => request<Job>(`/projects/${id}/transcribe`, { method: 'POST' }),

  transcript: (id: string) => request<Transcript>(`/projects/${id}/transcript`),

  analyze: (id: string) => request<Job>(`/projects/${id}/analyze`, { method: 'POST' }),

  analysis: (id: string) => request<TranscriptAnalysis>(`/projects/${id}/analysis`),

  autoClips: (id: string, payload: AutoClipsPayload = {}) =>
    request<Job>(`/projects/${id}/auto-clips`, { method: 'POST', body: JSON.stringify(payload) }),

  exportBatch: (id: string) => request<Job>(`/projects/${id}/export-batch`, { method: 'POST' }),

  captions: (id: string, style?: import('@/types').CaptionStyle) =>
    request<{ srt: string; ass: string; style: string }>(`/projects/${id}/captions`, {
      method: 'POST',
      body: JSON.stringify(style ? { style } : {}),
    }),

  burnCaptions: (
    projectId: string,
    clipId: string,
    opts: { format?: 'srt' | 'ass'; captionStyle?: import('@/types').CaptionStyle } = {},
  ) =>
    request<Job>(`/projects/${projectId}/clips/${clipId}/burn-captions`, {
      method: 'POST',
      body: JSON.stringify(opts),
    }),

  faceTrack: (id: string, start?: number, end?: number) => {
    const q = new URLSearchParams();
    if (start != null) q.set('start', String(start));
    if (end != null) q.set('end', String(end));
    const qs = q.toString();
    return request<{
      averageX: number;
      averageSecondaryX?: number;
      points: Array<{ time: number; x: number; secondaryX?: number }>;
      smoothed: Array<{ time: number; x: number; secondaryX?: number }>;
    }>(`/projects/${id}/face-track${qs ? `?${qs}` : ''}`);
  },

  videoStreamUrl: (id: string) => `${API_URL}/videos/${id}/stream`,
  thumbnailUrl: (id: string) => `${API_URL}/videos/${id}/thumbnail`,
};

export const videosApi = {
  getInfo: (projectId: string) => request<VideoInfo>(`/videos/${projectId}/info`),
};

export const clipsApi = {
  create: (projectId: string, payload: CreateClipPayload) =>
    request<Clip>(`/projects/${projectId}/clips`, { method: 'POST', body: JSON.stringify(payload) }),

  list: (projectId: string) => request<Clip[]>(`/projects/${projectId}/clips`),

  get: (id: string) => request<Clip>(`/clips/${id}`),

  delete: async (id: string) => {
    const res = await fetch(`${API_URL}/clips/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      let message = `Erro ${res.status}`;
      try {
        const body = (await res.json()) as ApiErrorResponse;
        message = Array.isArray(body.message) ? body.message.join(', ') : body.message || message;
      } catch {
        // ignore
      }
      throw new ApiError(res.status, message);
    }
  },

  cancel: (id: string) => request<Clip>(`/clips/${id}/cancel`, { method: 'POST' }),

  cancelPending: (projectId: string) =>
    request<{ cancelled: number }>(`/projects/${projectId}/clips/cancel-pending`, { method: 'POST' }),

  render: (id: string) => request<Clip>(`/clips/${id}/render`, { method: 'POST' }),

  updateFraming: (id: string, payload: { cropCenterX?: number; cropCenterXBottom?: number }) =>
    request<Clip>(`/clips/${id}/framing`, { method: 'PATCH', body: JSON.stringify(payload) }),

  setCaptions: (id: string, enabled: boolean) =>
    request<Clip>(`/clips/${id}/captions`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),

  setLayout: (id: string, layout: 'crop' | 'title', rerender?: boolean) =>
    request<Clip>(`/clips/${id}/layout`, {
      method: 'PATCH',
      body: JSON.stringify({ layout, rerender }),
    }),

  applyFramingToProject: (
    projectId: string,
    payload: { cropCenterX?: number | null; cropCenterXBottom?: number | null },
  ) =>
    request<{ updated: number }>(`/projects/${projectId}/clips/framing`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  streamUrl: (id: string) => `${API_URL}/clips/${id}/stream`,
  downloadUrl: (id: string) => `${API_URL}/clips/${id}/download`,
};

export const jobsApi = {
  list: (projectId?: string) =>
    request<Job[]>(projectId ? `/jobs?projectId=${encodeURIComponent(projectId)}` : '/jobs'),
  stats: () =>
    request<{ queued: number; running: number; failedRecent: number; total: number }>('/jobs/stats/summary'),
  get: (id: string) => request<Job>(`/jobs/${id}`),
  cancel: (id: string) => request<Job>(`/jobs/${id}/cancel`, { method: 'POST' }),
  clearFinished: () => request<{ cleared: number }>('/jobs/finished', { method: 'DELETE' }),
};

export const settingsApi = {
  get: () => request<AppSettings>('/settings'),
  update: (payload: UpdateAppSettingsPayload) =>
    request<AppSettings>('/settings', { method: 'PATCH', body: JSON.stringify(payload) }),
};

export const healthApi = {
  check: () => request<{ status: string }>('/health'),
  system: () => request<import('@/types').SystemHealth>('/health/system'),
  cleanup: (clearJobs = true) =>
    request<import('@/types').CleanupResult>(
      `/maintenance/cleanup${clearJobs ? '' : '?jobs=0'}`,
      { method: 'POST' },
    ),
};

export async function waitForJob(
  jobId: string,
  onUpdate?: (job: Job) => void,
  timeoutMs = 15 * 60 * 1000,
): Promise<Job> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const job = await jobsApi.get(jobId);
    onUpdate?.(job);
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return job;
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  throw new Error('Tempo esgotado aguardando o job');
}
