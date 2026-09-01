import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { rename, unlink } from 'fs/promises';
import { basename, extname } from 'path';
import type { Project } from '@ai-video-cutter/shared-types';
import { generateId } from '@ai-video-cutter/shared-utils';
import { StorageService } from '../../common/storage/storage.service';
import { ALLOWED_VIDEO_EXTENSIONS, THUMBNAIL_FILENAME } from '../../common/utils/constants';
import { FfmpegService } from '../processing/services/ffmpeg.service';
import { UrlDownloadService } from '../processing/services/url-download.service';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { ProjectRepository } from './repositories/project.repository.interface';
import { PROJECT_REPOSITORY } from './tokens/project-repository.token';

export interface UploadedFileLike {
  path: string;
  originalname: string;
  size: number;
}

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);
  /** Evita ingestões duplicadas em paralelo para o mesmo projeto. */
  private readonly ingesting = new Set<string>();

  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly repository: ProjectRepository,
    private readonly storage: StorageService,
    private readonly ffmpeg: FfmpegService,
    private readonly urlDownload: UrlDownloadService,
  ) {}

  async create(dto: CreateProjectDto): Promise<Project> {
    if (dto.sourceType === 'url' && !dto.sourceUrl?.trim()) {
      throw new BadRequestException('sourceUrl é obrigatório quando sourceType é "url"');
    }

    const now = new Date().toISOString();
    const project: Project = {
      id: generateId(),
      name: dto.name,
      sourceType: dto.sourceType,
      sourceUrl: dto.sourceUrl?.trim(),
      status: dto.sourceType === 'url' ? 'downloading' : 'created',
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.repository.create(project);

    if (created.sourceType === 'url' && created.sourceUrl) {
      void this.ingestFromUrl(created.id);
    }

    return created;
  }

  async findAll(): Promise<Project[]> {
    return this.repository.findAll();
  }

  async findById(id: string): Promise<Project> {
    const project = await this.repository.findById(id);
    if (!project) {
      throw new NotFoundException(`Projeto ${id} não encontrado`);
    }
    return project;
  }

  async update(id: string, patch: Partial<Project>): Promise<Project> {
    await this.findById(id);
    return this.repository.update(id, patch);
  }

  async remove(id: string): Promise<void> {
    await this.findById(id); // garante 404 se não existir
    await this.repository.delete(id);
  }

  /**
   * Move o arquivo enviado (já validado quanto a extensão/tamanho pelo
   * multer no controller) para storage/projects/{id}/original{ext}, extrai
   * metadados via ffprobe e gera a thumbnail.
   */
  async uploadOriginal(id: string, file: UploadedFileLike): Promise<Project> {
    const project = await this.findById(id);

    if (project.sourceType !== 'upload') {
      throw new BadRequestException('Este projeto não foi criado como sourceType "upload"');
    }

    const ext = this.extractAllowedExtension(file.originalname);

    await this.repository.update(id, { status: 'processing', errorMessage: undefined });

    const projectDir = this.storage.getProjectDir(id);
    const finalPath = this.storage.resolveSafePath(projectDir, `original${ext}`);

    try {
      await rename(file.path, finalPath);
    } catch (err) {
      this.logger.error(`Falha ao mover upload para ${finalPath}: ${(err as Error).message}`);
      await this.safeUnlink(file.path);
      await this.repository.update(id, { status: 'failed', errorMessage: 'Falha ao salvar arquivo enviado' });
      throw new BadRequestException('Não foi possível salvar o arquivo enviado');
    }

    return this.finalizeMedia(id, `original${ext}`, finalPath);
  }

  /**
   * Reprocessa download a partir da sourceUrl do projeto (retry manual).
   * Dispara em background e devolve o projeto já com status "downloading".
   */
  async startDownload(id: string): Promise<Project> {
    const project = await this.findById(id);

    if (project.sourceType !== 'url') {
      throw new BadRequestException('Este projeto não foi criado como sourceType "url"');
    }
    if (!project.sourceUrl) {
      throw new BadRequestException('Projeto sem sourceUrl');
    }
    if (this.ingesting.has(id)) {
      return project;
    }

    const updated = await this.repository.update(id, {
      status: 'downloading',
      errorMessage: undefined,
    });
    void this.ingestFromUrl(id);
    return updated;
  }

  /** Caminho absoluto e validado para o arquivo original de um projeto. */
  getOriginalFilePath(project: Project): string {
    if (!project.originalFile) {
      throw new NotFoundException('Este projeto ainda não possui um vídeo processado');
    }
    return this.storage.resolveSafePath(this.storage.getProjectDir(project.id), project.originalFile);
  }

  getThumbnailFilePath(project: Project): string {
    if (!project.thumbnailFile) {
      throw new NotFoundException('Este projeto ainda não possui thumbnail');
    }
    return this.storage.resolveSafePath(this.storage.getProjectDir(project.id), project.thumbnailFile);
  }

  private async ingestFromUrl(id: string): Promise<void> {
    if (this.ingesting.has(id)) return;
    this.ingesting.add(id);

    try {
      const project = await this.findById(id);
      if (!project.sourceUrl) {
        await this.repository.update(id, {
          status: 'failed',
          errorMessage: 'Projeto sem sourceUrl',
        });
        return;
      }

      await this.repository.update(id, { status: 'downloading', errorMessage: undefined });

      // Título real do vídeo (ex.: YouTube) → nome do projeto
      try {
        const title = await this.urlDownload.fetchVideoTitle(project.sourceUrl);
        if (title) {
          await this.repository.update(id, { name: title });
          this.logger.log(`Projeto ${id} renomeado para: ${title}`);
        }
      } catch (err) {
        this.logger.warn(`Não foi possível obter título: ${(err as Error).message}`);
      }

      const projectDir = this.storage.getProjectDir(id);
      await this.storage.ensureProjectDirs(id);

      const downloadedPath = await this.urlDownload.downloadToFile(project.sourceUrl, projectDir);
      const fileName = basename(downloadedPath);
      const ext = extname(fileName).toLowerCase();

      if (!ALLOWED_VIDEO_EXTENSIONS.includes(ext as (typeof ALLOWED_VIDEO_EXTENSIONS)[number])) {
        // yt-dlp às vezes entrega .webm etc. — ok se estiver na lista; senão falha
        await this.repository.update(id, {
          status: 'failed',
          errorMessage: `Formato baixado não suportado (${ext || 'desconhecido'})`,
        });
        return;
      }

      // Garante nome canônico original{ext}
      const canonicalName = `original${ext}`;
      const canonicalPath = this.storage.resolveSafePath(projectDir, canonicalName);
      if (downloadedPath !== canonicalPath) {
        await rename(downloadedPath, canonicalPath);
      }

      await this.repository.update(id, { status: 'processing' });
      await this.finalizeMedia(id, canonicalName, canonicalPath);
    } catch (err) {
      const message =
        err instanceof BadRequestException
          ? Array.isArray((err as any).message)
            ? (err as any).message.join(', ')
            : String((err as BadRequestException).message)
          : 'Falha ao baixar ou processar o vídeo da URL';
      this.logger.error(`Ingestão por URL falhou para ${id}: ${(err as Error).message}`);
      await this.repository.update(id, {
        status: 'failed',
        errorMessage: message,
      });
    } finally {
      this.ingesting.delete(id);
    }
  }

  private async finalizeMedia(id: string, originalFile: string, absolutePath: string): Promise<Project> {
    try {
      const info = await this.ffmpeg.getVideoInfo(absolutePath);
      const projectDir = this.storage.getProjectDir(id);
      const thumbnailPath = this.storage.resolveSafePath(projectDir, THUMBNAIL_FILENAME);
      await this.ffmpeg.generateThumbnail({
        inputPath: absolutePath,
        outputPath: thumbnailPath,
        timestamp: Math.min(1, info.duration || 1),
      });

      return this.repository.update(id, {
        originalFile,
        thumbnailFile: THUMBNAIL_FILENAME,
        duration: info.duration,
        width: info.width,
        height: info.height,
        fps: info.fps,
        status: 'completed',
        errorMessage: undefined,
      });
    } catch (err) {
      this.logger.error(`Falha ao processar vídeo do projeto ${id}: ${(err as Error).message}`);
      return this.repository.update(id, {
        status: 'failed',
        errorMessage: 'Falha ao processar o vídeo (verifique se o FFmpeg está instalado e o arquivo é válido)',
      });
    }
  }

  private extractAllowedExtension(originalname: string): string {
    const match = /\.[^./\\]+$/.exec(originalname);
    const ext = (match?.[0] ?? '').toLowerCase();
    if (!ALLOWED_VIDEO_EXTENSIONS.includes(ext as (typeof ALLOWED_VIDEO_EXTENSIONS)[number])) {
      throw new BadRequestException(
        `Extensão de arquivo não suportada. Use: ${ALLOWED_VIDEO_EXTENSIONS.join(', ')}`,
      );
    }
    return ext;
  }

  private async safeUnlink(path: string): Promise<void> {
    try {
      await unlink(path);
    } catch {
      // arquivo temporário já pode não existir — ignora
    }
  }
}
