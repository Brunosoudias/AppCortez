import { Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { Project } from '@ai-video-cutter/shared-types';
import { StorageService } from '../../../common/storage/storage.service';
import { PROJECT_METADATA_FILENAME } from '../../../common/utils/constants';
import type { ProjectRepository } from './project.repository.interface';

/**
 * Persistência baseada em arquivos JSON, um por projeto:
 *   storage/projects/{id}/project.json
 *
 * Sem banco de dados nesta versão — ver comentário em ProjectRepository
 * sobre como evoluir para PostgreSQL/Prisma futuramente.
 */
@Injectable()
export class JsonProjectRepository implements ProjectRepository {
  constructor(private readonly storage: StorageService) {}

  async create(project: Project): Promise<Project> {
    await this.writeProjectFile(project);
    return project;
  }

  async findAll(): Promise<Project[]> {
    const projectsRoot = join(this.storage.getStorageRoot(), 'projects');
    await mkdir(projectsRoot, { recursive: true });

    const entries = await readdir(projectsRoot, { withFileTypes: true });
    const projects: Project[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const project = await this.readProjectFile(entry.name);
      if (project) projects.push(project);
    }

    return projects.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async findById(id: string): Promise<Project | null> {
    return this.readProjectFile(id);
  }

  async update(id: string, patch: Partial<Project>): Promise<Project> {
    const existing = await this.readProjectFile(id);
    if (!existing) {
      throw new NotFoundException(`Projeto ${id} não encontrado`);
    }
    const updated: Project = {
      ...existing,
      ...patch,
      id: existing.id,
      updatedAt: new Date().toISOString(),
    };
    await this.writeProjectFile(updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.storage.deleteProjectDir(id);
  }

  private async readProjectFile(id: string): Promise<Project | null> {
    try {
      const filePath = this.storage.resolveSafePath(
        this.storage.getStorageRoot(),
        'projects',
        id,
        PROJECT_METADATA_FILENAME,
      );
      const raw = await readFile(filePath, 'utf-8');
      return JSON.parse(raw) as Project;
    } catch {
      return null;
    }
  }

  private async writeProjectFile(project: Project): Promise<void> {
    await this.storage.ensureProjectDirs(project.id);
    const filePath = this.storage.resolveSafePath(
      this.storage.getProjectDir(project.id),
      PROJECT_METADATA_FILENAME,
    );
    await writeFile(filePath, JSON.stringify(project, null, 2), 'utf-8');
  }
}
