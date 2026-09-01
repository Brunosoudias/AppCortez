import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, rm, access } from 'fs/promises';
import { join, resolve, sep } from 'path';

/**
 * Ponto único de acesso ao sistema de arquivos de storage/.
 *
 * Todo caminho de arquivo usado pela aplicação deve passar por
 * `resolveSafePath`, que garante que o resultado final nunca escape do
 * diretório de storage configurado — mesmo que algum segmento contenha
 * "../" ou outro valor inesperado (proteção contra path traversal).
 */
@Injectable()
export class StorageService {
  private readonly storageRoot: string;

  constructor(private readonly configService: ConfigService) {
    this.storageRoot = this.configService.get<string>('app.storagePath')!;
  }

  getStorageRoot(): string {
    return this.storageRoot;
  }

  getProjectDir(projectId: string): string {
    return this.resolveSafePath(this.storageRoot, 'projects', projectId);
  }

  getProjectClipsDir(projectId: string): string {
    return this.resolveSafePath(this.storageRoot, 'projects', projectId, 'clips');
  }

  getProjectExportsDir(projectId: string): string {
    return this.resolveSafePath(this.storageRoot, 'projects', projectId, 'exports');
  }

  getTempDir(): string {
    return this.resolveSafePath(this.storageRoot, 'temp');
  }

  async ensureProjectDirs(projectId: string): Promise<void> {
    await mkdir(this.getProjectDir(projectId), { recursive: true });
    await mkdir(this.getProjectClipsDir(projectId), { recursive: true });
    await mkdir(this.getProjectExportsDir(projectId), { recursive: true });
  }

  async deleteProjectDir(projectId: string): Promise<void> {
    const dir = this.getProjectDir(projectId);
    await rm(dir, { recursive: true, force: true });
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolve `base` + `segments` em um caminho absoluto e garante que o
   * resultado permaneça dentro de `base`. Lança BadRequestException caso
   * algum segmento tente sair do diretório (ex: "..", caminho absoluto de
   * outro drive, etc).
   */
  resolveSafePath(base: string, ...segments: string[]): string {
    const normalizedBase = resolve(base);
    const target = resolve(normalizedBase, ...segments);

    if (target !== normalizedBase && !target.startsWith(normalizedBase + sep)) {
      throw new BadRequestException('Caminho inválido');
    }

    return target;
  }

  join(...segments: string[]): string {
    return join(...segments);
  }
}
