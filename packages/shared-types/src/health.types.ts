export interface BinaryHealth {
  name: string;
  available: boolean;
  detail?: string;
}

export interface SystemHealth {
  status: 'ok' | 'degraded';
  checkedAt: string;
  binaries: BinaryHealth[];
  openaiConfigured: boolean;
  storagePath: string;
  tempFileCount: number;
  jobsQueued: number;
  jobsRunning: number;
  jobsFailedRecent: number;
}

export interface CleanupResult {
  deletedTempFiles: number;
  clearedJobs: number;
  freedApproxBytes: number;
}
