import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { readdir, rm, stat } from 'fs/promises';
import { join } from 'path';
import type { CleanupResult, SystemHealth } from '@ai-video-cutter/shared-types';
import { StorageService } from '../../common/storage/storage.service';
import { JobQueueService } from '../jobs/job-queue.service';
import { SettingsService } from '../settings/settings.service';
import { resolveYtDlpPath } from '../../common/utils/resolve-yt-dlp.util';

@Injectable()
export class HealthService {
  constructor(
    private readonly config: ConfigService,
    private readonly storage: StorageService,
    private readonly jobs: JobQueueService,
    private readonly settings: SettingsService,
  ) {}

  async getSystemHealth(): Promise<SystemHealth> {
    const settings = await this.settings.get();
    const ffmpegPath = this.config.get<string>('app.ffmpegPath') ?? 'ffmpeg';
    const ffprobePath = this.config.get<string>('app.ffprobePath') ?? 'ffprobe';
    const ytDlpPath = resolveYtDlpPath(this.config.get<string>('app.ytDlpPath'));
    const whisperCli = settings.whisperCliPath || 'whisper';

    const [ffmpeg, ffprobe, ytDlp, whisper] = await Promise.all([
      this.probeBinary(ffmpegPath, ['-version']),
      this.probeBinary(ffprobePath, ['-version']),
      this.probeBinary(ytDlpPath, ['--version']),
      this.probeBinary(whisperCli, ['--help']),
    ]);

    const binaries = [
      { name: 'ffmpeg', available: ffmpeg.ok, detail: ffmpeg.detail },
      { name: 'ffprobe', available: ffprobe.ok, detail: ffprobe.detail },
      { name: 'yt-dlp', available: ytDlp.ok, detail: ytDlp.detail },
      { name: 'whisper-cli', available: whisper.ok, detail: whisper.detail },
    ];

    const counts = this.jobs.counts();
    const tempFileCount = await this.countTempFiles();
    const coreOk = ffmpeg.ok && ffprobe.ok;
    const status: SystemHealth['status'] = coreOk ? 'ok' : 'degraded';

    return {
      status,
      checkedAt: new Date().toISOString(),
      binaries,
      openaiConfigured: settings.openaiConfigured,
      storagePath: this.storage.getStorageRoot(),
      tempFileCount,
      jobsQueued: counts.queued,
      jobsRunning: counts.running,
      jobsFailedRecent: counts.failedRecent,
    };
  }

  async cleanupTemp(clearFinishedJobs = true): Promise<CleanupResult> {
    const tempDir = this.storage.getTempDir();
    let deletedTempFiles = 0;
    let freedApproxBytes = 0;

    try {
      const entries = await readdir(tempDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === '.gitkeep') continue;
        const full = join(tempDir, entry.name);
        try {
          const s = await stat(full);
          freedApproxBytes += s.size;
          await rm(full, { recursive: true, force: true });
          deletedTempFiles += 1;
        } catch {
          // ignore individual failures
        }
      }
    } catch {
      // temp pode não existir
    }

    const clearedJobs = clearFinishedJobs ? await this.jobs.clearFinished() : 0;

    return { deletedTempFiles, clearedJobs, freedApproxBytes };
  }

  private async countTempFiles(): Promise<number> {
    try {
      const entries = await readdir(this.storage.getTempDir());
      return entries.filter((e) => e !== '.gitkeep').length;
    } catch {
      return 0;
    }
  }

  private probeBinary(binary: string, args: string[]): Promise<{ ok: boolean; detail?: string }> {
    return new Promise((resolve) => {
      const child = spawn(binary, args, { shell: false });
      let stdout = '';
      const timer = setTimeout(() => {
        child.kill();
        resolve({ ok: false, detail: 'timeout' });
      }, 4000);

      child.stdout.on('data', (c) => {
        stdout += c.toString();
      });
      child.stderr.on('data', (c) => {
        stdout += c.toString();
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({ ok: false, detail: err.message });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0 || stdout.length > 0) {
          resolve({ ok: true, detail: stdout.split('\n')[0]?.slice(0, 120) });
        } else {
          resolve({ ok: false, detail: `exit ${code}` });
        }
      });
    });
  }
}
