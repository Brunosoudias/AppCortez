import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { Job, JobType } from '@ai-video-cutter/shared-types';
import { generateId } from '@ai-video-cutter/shared-utils';
import { StorageService } from '../../common/storage/storage.service';
import { JOBS_FILENAME } from '../../common/utils/constants';

type JobHandler = (job: Job, update: (patch: Partial<Job>) => Promise<Job>) => Promise<Record<string, unknown> | void>;

@Injectable()
export class JobQueueService implements OnModuleInit {
  private readonly logger = new Logger(JobQueueService.name);
  private jobs: Job[] = [];
  private handlers = new Map<JobType, JobHandler>();
  private running = false;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly storage: StorageService) {}

  async onModuleInit() {
    await this.load();
    // Requeue jobs stuck in running after restart
    this.jobs = this.jobs.map((j) =>
      j.status === 'running' ? { ...j, status: 'queued' as const, message: 'Reenfileirado após reinício' } : j,
    );
    await this.persist();
    // Aguarda handlers de outros módulos (IntelligenceService) registrarem
    setTimeout(() => this.kick(), 300);
  }

  registerHandler(type: JobType, handler: JobHandler) {
    this.handlers.set(type, handler);
  }

  async enqueue(input: {
    type: JobType;
    projectId?: string;
    clipId?: string;
    message?: string;
    result?: Record<string, unknown>;
  }): Promise<Job> {
    const now = new Date().toISOString();
    const job: Job = {
      id: generateId(),
      type: input.type,
      status: 'queued',
      progress: 0,
      projectId: input.projectId,
      clipId: input.clipId,
      message: input.message,
      result: input.result,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.unshift(job);
    await this.persist();
    this.kick();
    return job;
  }

  list(limit = 50): Job[] {
    return this.jobs.slice(0, limit);
  }

  get(id: string): Job | undefined {
    return this.jobs.find((j) => j.id === id);
  }

  listByProject(projectId: string): Job[] {
    return this.jobs.filter((j) => j.projectId === projectId);
  }

  async cancel(id: string): Promise<Job | undefined> {
    const job = this.get(id);
    if (!job) return undefined;
    if (job.status === 'queued' || job.status === 'running') {
      return this.update(id, {
        status: 'cancelled',
        message: 'Cancelado pelo usuário',
        progress: job.progress,
      });
    }
    return job;
  }

  isCancelled(id: string): boolean {
    return this.get(id)?.status === 'cancelled';
  }

  /** Remove jobs finalizados (completed/failed/cancelled). */
  async clearFinished(): Promise<number> {
    const before = this.jobs.length;
    this.jobs = this.jobs.filter((j) => j.status === 'queued' || j.status === 'running');
    await this.persist();
    return before - this.jobs.length;
  }

  counts(): { queued: number; running: number; failedRecent: number; total: number } {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return {
      queued: this.jobs.filter((j) => j.status === 'queued').length,
      running: this.jobs.filter((j) => j.status === 'running').length,
      failedRecent: this.jobs.filter(
        (j) => j.status === 'failed' && new Date(j.updatedAt).getTime() > dayAgo,
      ).length,
      total: this.jobs.length,
    };
  }

  private async update(id: string, patch: Partial<Job>): Promise<Job> {
    const idx = this.jobs.findIndex((j) => j.id === id);
    if (idx < 0) throw new Error(`Job ${id} não encontrado`);
    const current = this.jobs[idx];
    // Não sobrescreve cancelamento com progresso/conclusão do handler
    if (current.status === 'cancelled' && patch.status !== 'cancelled') {
      return current;
    }
    const updated: Job = {
      ...current,
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
    };
    this.jobs[idx] = updated;
    this.schedulePersist();
    return updated;
  }

  private kick() {
    if (this.running) return;
    void this.loop();
  }

  private async loop() {
    this.running = true;
    try {
      while (true) {
        const next = this.jobs.find((j) => j.status === 'queued');
        if (!next) break;

        const handler = this.handlers.get(next.type);
        await this.update(next.id, { status: 'running', progress: 1, message: 'Em execução…' });

        if (!handler) {
          await this.update(next.id, {
            status: 'failed',
            errorMessage: `Sem handler para job type ${next.type}`,
            progress: 0,
          });
          continue;
        }

        try {
          const result = await handler(next, (patch) => this.update(next.id, patch));
          if (this.isCancelled(next.id)) {
            continue;
          }
          await this.update(next.id, {
            status: 'completed',
            progress: 100,
            message: 'Concluído',
            result: result ?? next.result,
            errorMessage: undefined,
          });
        } catch (err) {
          if (this.isCancelled(next.id) || /cancelad/i.test((err as Error).message || '')) {
            await this.update(next.id, {
              status: 'cancelled',
              message: 'Cancelado pelo usuário',
            });
            continue;
          }
          this.logger.error(`Job ${next.id} (${next.type}) falhou: ${(err as Error).message}`);
          await this.update(next.id, {
            status: 'failed',
            progress: 0,
            errorMessage: (err as Error).message || 'Falha no job',
          });
        }
      }
    } finally {
      this.running = false;
      await this.persist();
    }
  }

  private jobsFile(): string {
    return join(this.storage.getStorageRoot(), JOBS_FILENAME);
  }

  private async load() {
    try {
      const raw = await readFile(this.jobsFile(), 'utf-8');
      this.jobs = JSON.parse(raw) as Job[];
    } catch {
      this.jobs = [];
    }
  }

  private schedulePersist() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persist();
    }, 250);
  }

  private async persist() {
    await mkdir(this.storage.getStorageRoot(), { recursive: true });
    await writeFile(this.jobsFile(), JSON.stringify(this.jobs.slice(0, 200), null, 2), 'utf-8');
  }
}
