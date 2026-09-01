export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type JobType =
  | 'transcribe'
  | 'analyze'
  | 'auto-clips'
  | 'render'
  | 'export-batch'
  | 'download'
  | 'burn-captions';

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  projectId?: string;
  clipId?: string;
  message?: string;
  errorMessage?: string;
  result?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
