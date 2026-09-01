import { Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { Clip } from '@ai-video-cutter/shared-types';
import { StorageService } from '../../../common/storage/storage.service';
import { CLIPS_METADATA_FILENAME } from '../../../common/utils/constants';
import type { ClipRepository } from './clip.repository.interface';

/**
 * Persistência baseada em arquivo JSON por projeto:
 *   storage/projects/{projectId}/clips.json  (array de Clip)
 *
 * `findById` não recebe o projectId (contrato de `ClipRepository`), então
 * varre os projetos existentes. Para o volume de uso local (dezenas de
 * projetos, poucos cortes cada) isso é simples e rápido o suficiente —
 * numa migração para banco de dados isso vira um SELECT direto por id.
 */
@Injectable()
export class JsonClipRepository implements ClipRepository {
  constructor(private readonly storage: StorageService) {}

  async create(clip: Clip): Promise<Clip> {
    const clips = await this.readClipsFile(clip.projectId);
    clips.push(clip);
    await this.writeClipsFile(clip.projectId, clips);
    return clip;
  }

  async findAllByProject(projectId: string): Promise<Clip[]> {
    return this.readClipsFile(projectId);
  }

  async findById(clipId: string): Promise<Clip | null> {
    const projectIds = await this.listProjectIds();
    for (const projectId of projectIds) {
      const clips = await this.readClipsFile(projectId);
      const found = clips.find((c) => c.id === clipId);
      if (found) return found;
    }
    return null;
  }

  async update(clipId: string, patch: Partial<Clip>): Promise<Clip> {
    const existing = await this.findById(clipId);
    if (!existing) {
      throw new NotFoundException(`Corte ${clipId} não encontrado`);
    }

    const updated: Clip = {
      ...existing,
      ...patch,
      id: existing.id,
      projectId: existing.projectId,
      updatedAt: new Date().toISOString(),
    };

    // Permite limpar campos opcionais passando undefined no patch
    for (const key of Object.keys(patch) as Array<keyof Clip>) {
      if (patch[key] === undefined) {
        delete updated[key];
      }
    }

    const clips = await this.readClipsFile(existing.projectId);
    const index = clips.findIndex((c) => c.id === clipId);
    clips[index] = updated;
    await this.writeClipsFile(existing.projectId, clips);

    return updated;
  }

  async delete(clipId: string): Promise<void> {
    const existing = await this.findById(clipId);
    if (!existing) return;
    const clips = await this.readClipsFile(existing.projectId);
    await this.writeClipsFile(
      existing.projectId,
      clips.filter((c) => c.id !== clipId),
    );
  }

  private async listProjectIds(): Promise<string[]> {
    const projectsRoot = join(this.storage.getStorageRoot(), 'projects');
    await mkdir(projectsRoot, { recursive: true });
    const entries = await readdir(projectsRoot, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  }

  private async readClipsFile(projectId: string): Promise<Clip[]> {
    try {
      const filePath = this.storage.resolveSafePath(
        this.storage.getProjectDir(projectId),
        CLIPS_METADATA_FILENAME,
      );
      const raw = await readFile(filePath, 'utf-8');
      return JSON.parse(raw) as Clip[];
    } catch {
      return [];
    }
  }

  private async writeClipsFile(projectId: string, clips: Clip[]): Promise<void> {
    await this.storage.ensureProjectDirs(projectId);
    const filePath = this.storage.resolveSafePath(
      this.storage.getProjectDir(projectId),
      CLIPS_METADATA_FILENAME,
    );
    await writeFile(filePath, JSON.stringify(clips, null, 2), 'utf-8');
  }
}
