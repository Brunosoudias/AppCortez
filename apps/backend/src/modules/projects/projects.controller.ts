import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { join } from 'path';
import type { Project } from '@ai-video-cutter/shared-types';
import { getStorageRootFromEnv } from '../../common/utils/storage-env.util';
import { ALLOWED_VIDEO_EXTENSIONS } from '../../common/utils/constants';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectsService } from './projects.service';

const MAX_UPLOAD_SIZE_BYTES = parseInt(process.env.MAX_UPLOAD_SIZE_MB ?? '2048', 10) * 1024 * 1024;

@Controller()
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post('projects')
  create(@Body() dto: CreateProjectDto): Promise<Project> {
    return this.projectsService.create(dto);
  }

  @Get('projects')
  findAll(): Promise<Project[]> {
    return this.projectsService.findAll();
  }

  @Get('projects/:id')
  findOne(@Param('id') id: string): Promise<Project> {
    return this.projectsService.findById(id);
  }

  @Delete('projects/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.projectsService.remove(id);
  }

  @Post('projects/:id/download')
  startDownload(@Param('id') id: string): Promise<Project> {
    return this.projectsService.startDownload(id);
  }

  @Post('projects/:id/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        // Destino fixo e não derivado de input do usuário: o arquivo é
        // movido para seu local definitivo dentro de ProjectsService,
        // depois de validar o projectId.
        destination: (_req, _file, cb) => cb(null, join(getStorageRootFromEnv(), 'temp')),
        filename: (_req, _file, cb) => cb(null, `${randomUUID()}.upload`),
      }),
      limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        const ext = /\.[^./\\]+$/.exec(file.originalname)?.[0]?.toLowerCase() ?? '';
        if (!ALLOWED_VIDEO_EXTENSIONS.includes(ext as (typeof ALLOWED_VIDEO_EXTENSIONS)[number])) {
          cb(new BadRequestException(`Extensão não suportada. Use: ${ALLOWED_VIDEO_EXTENSIONS.join(', ')}`), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  upload(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<Project> {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado (campo "file" ausente)');
    }
    return this.projectsService.uploadOriginal(id, file);
  }
}
