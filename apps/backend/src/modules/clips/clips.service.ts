import { existsSync } from 'fs';
import { unlink, writeFile, readFile } from 'fs/promises';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { Clip, Transcript } from '@ai-video-cutter/shared-types';
import { generateId } from '@ai-video-cutter/shared-utils';
import { StorageService } from '../../common/storage/storage.service';
import {
  CAPTIONS_ASS_FILENAME,
  TRANSCRIPT_FILENAME,
} from '../../common/utils/constants';
import { ProjectsService } from '../projects/projects.service';
import { FfmpegService } from '../processing/services/ffmpeg.service';
import { FaceTrackService } from '../processing/services/face-track.service';
import { SettingsService } from '../settings/settings.service';
import {
  CAPTION_SERVICE,
  type CaptionService,
} from '../processing/interfaces/caption-service.interface';
import type { CreateClipDto } from './dto/create-clip.dto';
import type { ClipRepository } from './repositories/clip.repository.interface';
import { CLIP_REPOSITORY } from './tokens/clip-repository.token';

@Injectable()
export class ClipsService {
  private readonly logger = new Logger(ClipsService.name);
  private readonly rendering = new Set<string>();
  private readonly cancelled = new Set<string>();

  constructor(
    @Inject(CLIP_REPOSITORY) private readonly repository: ClipRepository,
    private readonly storage: StorageService,
    private readonly projectsService: ProjectsService,
    private readonly ffmpeg: FfmpegService,
    @Optional() private readonly faceTrack?: FaceTrackService,
    @Optional() private readonly settings?: SettingsService,
    @Optional() @Inject(CAPTION_SERVICE) private readonly captions?: CaptionService,
  ) {}

  async create(projectId: string, dto: CreateClipDto): Promise<Clip> {
    const project = await this.projectsService.findById(projectId);

    if (dto.endTime <= dto.startTime) {
      throw new BadRequestException('endTime deve ser maior que startTime');
    }
    if (project.duration && dto.endTime > project.duration + 0.5) {
      throw new BadRequestException(
        `endTime (${dto.endTime}s) excede a duração do vídeo (${project.duration}s)`,
      );
    }

    const now = new Date().toISOString();
    const clip: Clip = {
      id: generateId(),
      projectId,
      startTime: dto.startTime,
      endTime: dto.endTime,
      duration: dto.endTime - dto.startTime,
      title: dto.title,
      titleCta: dto.titleCta,
      score: dto.score,
      reason: dto.reason,
      format: dto.format ?? '16:9',
      layout: dto.layout ?? (dto.format === '9:16' ? 'title' : 'crop'),
      cropCenterX: dto.cropCenterX,
      cropCenterXBottom: dto.cropCenterXBottom,
      status: 'created',
      progress: 0,
      createdAt: now,
      updatedAt: now,
    };

    return this.repository.create(clip);
  }

  async findAllByProject(projectId: string): Promise<Clip[]> {
    await this.projectsService.findById(projectId);
    return this.repository.findAllByProject(projectId);
  }

  async findById(clipId: string): Promise<Clip> {
    const clip = await this.repository.findById(clipId);
    if (!clip) {
      throw new NotFoundException(`Corte ${clipId} não encontrado`);
    }
    return clip;
  }

  async update(clipId: string, patch: Partial<Clip>): Promise<Clip> {
    await this.findById(clipId);
    return this.repository.update(clipId, patch);
  }

  async updateFraming(
    clipId: string,
    framing: { cropCenterX?: number | null; cropCenterXBottom?: number | null },
  ): Promise<Clip> {
    await this.findById(clipId);
    const patch: Partial<Clip> = {};
    if (framing.cropCenterX === null) patch.cropCenterX = undefined;
    else if (typeof framing.cropCenterX === 'number') patch.cropCenterX = framing.cropCenterX;
    if (framing.cropCenterXBottom === null) patch.cropCenterXBottom = undefined;
    else if (typeof framing.cropCenterXBottom === 'number') {
      patch.cropCenterXBottom = framing.cropCenterXBottom;
    }
    return this.repository.update(clipId, patch);
  }

  /** Altera layout vertical (9:16 completo vs vídeo + painel de texto) e opcionalmente re-renderiza. */
  async updateLayout(
    clipId: string,
    layout: 'crop' | 'title',
    rerender?: boolean,
  ): Promise<Clip> {
    const clip = await this.findById(clipId);

    if (clip.format !== '9:16') {
      throw new BadRequestException('Layout só se aplica a cortes 9:16');
    }
    if (clip.status === 'processing' || this.rendering.has(clipId)) {
      throw new BadRequestException('Aguarde o processamento atual terminar');
    }

    const shouldRerender = rerender ?? clip.status === 'completed';

    const updated = await this.repository.update(clipId, {
      layout,
      ...(shouldRerender
        ? {
            status: 'processing' as const,
            progress: 0,
            outputFile: undefined,
            captionsFile: undefined,
            errorMessage: undefined,
          }
        : {}),
    });

    if (shouldRerender) {
      void this.runRender(clipId);
    }

    return updated;
  }

  async applyFramingToProject(
    projectId: string,
    framing: { cropCenterX?: number | null; cropCenterXBottom?: number | null },
  ): Promise<{ updated: number }> {
    const clips = await this.findAllByProject(projectId);
    for (const clip of clips) {
      await this.updateFraming(clip.id, framing);
    }
    return { updated: clips.length };
  }

  /**
   * Liga/desliga legendas queimadas no MP4 do corte.
   * Mantém o MP4 limpo (`{id}.mp4`) e o com legendas (`{id}.captioned.mp4`)
   * para alternar rápido quando os dois já existem.
   */
  async setCaptionsEnabled(clipId: string, enabled: boolean): Promise<Clip> {
    const clip = await this.findById(clipId);

    if (clip.status === 'processing' || this.rendering.has(clipId)) {
      throw new BadRequestException('Aguarde o processamento atual terminar');
    }

    if (!enabled) {
      return this.disableBurnedCaptions(clip);
    }
    return this.enableBurnedCaptions(clip);
  }

  private cleanOutputRel(clipId: string): string {
    return `clips/${clipId}.mp4`;
  }

  private captionedOutputRel(clipId: string): string {
    return `clips/${clipId}.captioned.mp4`;
  }

  private async disableBurnedCaptions(clip: Clip): Promise<Clip> {
    const clipsDir = this.storage.getProjectClipsDir(clip.projectId);
    const cleanRel = this.cleanOutputRel(clip.id);
    const cleanPath = this.storage.resolveSafePath(clipsDir, `${clip.id}.mp4`);

    if (existsSync(cleanPath)) {
      return this.repository.update(clip.id, {
        burnCaptions: false,
        captionsFile: undefined,
        outputFile: cleanRel,
        status: 'completed',
        progress: 100,
        errorMessage: undefined,
      });
    }

    // Sem MP4 limpo: re-renderiza a partir do original
    await this.repository.update(clip.id, {
      burnCaptions: false,
      captionsFile: undefined,
    });
    return this.startRender(clip.id);
  }

  private async enableBurnedCaptions(clip: Clip): Promise<Clip> {
    const clipsDir = this.storage.getProjectClipsDir(clip.projectId);
    const captionedRel = this.captionedOutputRel(clip.id);
    const captionedPath = this.storage.resolveSafePath(clipsDir, `${clip.id}.captioned.mp4`);

    // Já tem versão com legendas pronta
    if (existsSync(captionedPath)) {
      return this.repository.update(clip.id, {
        burnCaptions: true,
        captionsFile: CAPTIONS_ASS_FILENAME,
        outputFile: captionedRel,
        status: 'completed',
        progress: 100,
        errorMessage: undefined,
      });
    }

    if (clip.status !== 'completed' || !clip.outputFile) {
      // Preferência salva; legendas entram no próximo render/burn
      return this.repository.update(clip.id, { burnCaptions: true });
    }

    if (!this.captions) {
      throw new BadRequestException('Serviço de legendas indisponível');
    }

    const updated = await this.repository.update(clip.id, {
      burnCaptions: true,
      status: 'processing',
      progress: 0,
      errorMessage: undefined,
    });
    void this.runBurnCaptions(clip.id);
    return updated;
  }

  private async runBurnCaptions(clipId: string): Promise<void> {
    if (this.rendering.has(clipId)) return;
    this.rendering.add(clipId);

    try {
      const clip = await this.findById(clipId);
      if (!this.captions) throw new Error('CaptionService indisponível');

      const transcriptPath = this.storage.resolveSafePath(
        this.storage.getProjectDir(clip.projectId),
        TRANSCRIPT_FILENAME,
      );
      let transcript: Transcript;
      try {
        transcript = JSON.parse(await readFile(transcriptPath, 'utf-8')) as Transcript;
      } catch {
        throw new BadRequestException('Gere a transcrição antes de ativar legendas');
      }

      const settings = this.settings ? await this.settings.get() : null;
      const style = settings?.captionStyle ?? 'reels';

      const clipped: Transcript = {
        ...transcript,
        segments: transcript.segments
          .filter((s) => s.end > clip.startTime && s.start < clip.endTime)
          .map((s) => ({
            ...s,
            start: Math.max(0, s.start - clip.startTime),
            end: Math.max(0.05, Math.min(clip.duration, s.end - clip.startTime)),
          })),
      };

      if (!clipped.segments.length) {
        throw new BadRequestException('Nenhum trecho de fala neste corte para legendas');
      }

      // Garante MP4 limpo como fonte do burn
      const clipsDir = this.storage.getProjectClipsDir(clip.projectId);
      const cleanPath = this.storage.resolveSafePath(clipsDir, `${clip.id}.mp4`);
      let sourcePath: string;
      if (existsSync(cleanPath)) {
        sourcePath = cleanPath;
      } else {
        sourcePath = this.getOutputFilePath(clip);
      }

      const tempCap = this.storage.resolveSafePath(this.storage.getTempDir(), `${clip.id}.ass`);
      await writeFile(tempCap, await this.captions.generateAss(clipped, { style }), 'utf-8');

      const outPath = this.storage.resolveSafePath(clipsDir, `${clip.id}.captioned.mp4`);
      await this.repository.update(clipId, { progress: 40 }).catch(() => undefined);
      await this.captions.burnCaptions(sourcePath, tempCap, outPath);
      await unlink(tempCap).catch(() => undefined);

      if (this.cancelled.has(clipId)) {
        throw new Error('Cancelado pelo usuário');
      }

      await this.repository.update(clipId, {
        status: 'completed',
        progress: 100,
        burnCaptions: true,
        outputFile: this.captionedOutputRel(clipId),
        captionsFile: CAPTIONS_ASS_FILENAME,
        errorMessage: undefined,
      });
    } catch (err) {
      const cancelled = this.cancelled.has(clipId) || /cancelad/i.test((err as Error).message || '');
      this.logger.error(`Falha ao queimar legendas ${clipId}: ${(err as Error).message}`);
      await this.repository.update(clipId, {
        status: cancelled ? 'failed' : 'failed',
        progress: 0,
        burnCaptions: true,
        errorMessage: cancelled
          ? 'Cancelado pelo usuário'
          : (err as Error).message || 'Falha ao aplicar legendas',
      });
    } finally {
      this.rendering.delete(clipId);
      this.cancelled.delete(clipId);
    }
  }

  async delete(clipId: string): Promise<void> {
    const clip = await this.findById(clipId);
    if (this.rendering.has(clipId) || clip.status === 'processing') {
      await this.cancel(clipId);
    }

    const fresh = await this.findById(clipId).catch(() => null);
    if (!fresh) return;

    const candidates = [
      fresh.outputFile,
      `clips/${fresh.id}.mp4`,
      `clips/${fresh.id}.captioned.mp4`,
    ].filter(Boolean) as string[];

    for (const relative of new Set(candidates)) {
      try {
        const abs = this.storage.resolveSafePath(this.storage.getProjectDir(fresh.projectId), relative);
        await unlink(abs);
      } catch {
        // arquivo pode não existir
      }
    }

    await this.repository.delete(clipId);
    this.cancelled.delete(clipId);
    this.logger.log(`Corte ${clipId} excluído`);
  }

  /** Cancela render em andamento (ou marca falha se travado). */
  async cancel(clipId: string): Promise<Clip> {
    const clip = await this.findById(clipId);
    this.cancelled.add(clipId);
    this.ffmpeg.abort(clipId);
    this.rendering.delete(clipId);

    if (clip.status === 'completed') {
      return clip;
    }

    return this.repository.update(clipId, {
      status: 'failed',
      progress: 0,
      errorMessage: 'Cancelado pelo usuário',
    });
  }

  /** Cancela todos os cortes ainda não prontos de um projeto. */
  async cancelPendingByProject(projectId: string): Promise<{ cancelled: number }> {
    await this.projectsService.findById(projectId);
    const clips = await this.findAllByProject(projectId);
    let cancelled = 0;
    for (const clip of clips) {
      if (clip.status === 'completed') continue;
      await this.cancel(clip.id);
      cancelled += 1;
    }
    return { cancelled };
  }

  async startRender(clipId: string): Promise<Clip> {
    const clip = await this.findById(clipId);

    if (clip.status === 'processing' || this.rendering.has(clipId)) {
      return clip;
    }

    this.cancelled.delete(clipId);

    const project = await this.projectsService.findById(clip.projectId);
    this.projectsService.getOriginalFilePath(project);

    const updated = await this.repository.update(clipId, {
      status: 'processing',
      progress: 0,
      errorMessage: undefined,
    });

    void this.runRender(clipId);
    return updated;
  }

  async render(clipId: string): Promise<Clip> {
    return this.startRender(clipId);
  }

  getOutputFilePath(clip: Clip): string {
    if (!clip.outputFile) {
      throw new NotFoundException('Este corte ainda não foi renderizado');
    }
    return this.storage.resolveSafePath(this.storage.getProjectDir(clip.projectId), clip.outputFile);
  }

  private async runRender(clipId: string): Promise<void> {
    if (this.rendering.has(clipId)) return;
    this.rendering.add(clipId);

    let lastProgressWrite = 0;

    try {
      const clip = await this.findById(clipId);
      const project = await this.projectsService.findById(clip.projectId);
      const inputPath = this.projectsService.getOriginalFilePath(project);

      await this.storage.ensureProjectDirs(clip.projectId);
      const clipsDir = this.storage.getProjectClipsDir(clip.projectId);
      const outputFile = `${clip.id}.mp4`;
      const outputPath = this.storage.resolveSafePath(clipsDir, outputFile);

      let cropCenterX = 0.5;
      let cropCenterXBottom: number | undefined =
        typeof clip.cropCenterXBottom === 'number' ? clip.cropCenterXBottom : undefined;
      let cropXExpression: string | undefined;
      let cropXExpressionBottom: string | undefined;
      const faceEnabled = this.settings ? (await this.settings.get()).faceTrackingEnabled : true;

      // Preferência: enquadramento manual salvo no corte
      if (typeof clip.cropCenterX === 'number') {
        cropCenterX = Math.min(1, Math.max(0, clip.cropCenterX));
      } else if (faceEnabled && this.faceTrack && (clip.format === '9:16' || clip.format === '1:1')) {
        try {
          const track = await this.faceTrack.analyze(inputPath, clip.startTime, clip.endTime, 14);
          cropCenterX = track.averageX;
          cropXExpression = track.cropXExpression;
          if (clip.layout !== 'title' && cropCenterXBottom == null) {
            cropCenterXBottom = track.averageSecondaryX;
            cropXExpressionBottom = track.cropXExpressionSecondary;
          }
          this.logger.log(
            `FaceTrack clip ${clipId}: falante=${cropCenterX.toFixed(3)} outro=${(cropCenterXBottom ?? 0).toFixed(3)} pts=${track.smoothed.length}`,
          );
        } catch (err) {
          this.logger.warn(`FaceTrack ignorado: ${(err as Error).message}`);
        }
      }

      const onProgress = (percent: number) => {
        if (this.cancelled.has(clipId)) return;
        const now = Date.now();
        if (percent < 100 && now - lastProgressWrite < 400) return;
        lastProgressWrite = now;
        void this.repository.update(clipId, { progress: percent }).catch(() => undefined);
      };

      if (this.cancelled.has(clipId)) {
        throw new Error('Cancelado pelo usuário');
      }

      await this.ffmpeg.cutAndFit({
        inputPath,
        outputPath,
        startTime: clip.startTime,
        endTime: clip.endTime,
        format: clip.format,
        layout: clip.layout ?? (clip.format === '9:16' ? 'title' : 'crop'),
        cropCenterX,
        cropXExpression: typeof clip.cropCenterX === 'number' ? undefined : cropXExpression,
        cropCenterXBottom,
        cropXExpressionBottom:
          typeof clip.cropCenterXBottom === 'number' ? undefined : cropXExpressionBottom,
        titleText: clip.title,
        titleCta: clip.titleCta,
        onProgress,
        abortKey: clipId,
      });

      if (this.cancelled.has(clipId)) {
        throw new Error('Cancelado pelo usuário');
      }

      await this.repository.update(clipId, {
        status: 'completed',
        progress: 100,
        outputFile: `clips/${outputFile}`,
        captionsFile: undefined,
        errorMessage: undefined,
      });

      // Preferência de legendas: aplica burn após o render limpo
      const refreshed = await this.findById(clipId);
      if (refreshed.burnCaptions && this.captions && !this.cancelled.has(clipId)) {
        this.rendering.delete(clipId);
        await this.repository.update(clipId, {
          status: 'processing',
          progress: 0,
        });
        await this.runBurnCaptions(clipId);
        return;
      }
    } catch (err) {
      const cancelled = this.cancelled.has(clipId) || /cancelad/i.test((err as Error).message || '');
      this.logger.error(`Falha ao renderizar corte ${clipId}: ${(err as Error).message}`);
      await this.repository.update(clipId, {
        status: 'failed',
        progress: 0,
        errorMessage: cancelled
          ? 'Cancelado pelo usuário'
          : (err as Error).message?.includes('FFmpeg') || (err as Error).message?.includes('ffmpeg')
            ? (err as Error).message
            : 'Falha ao renderizar o corte (verifique se o FFmpeg está instalado e o formato do vídeo)',
      });
    } finally {
      this.rendering.delete(clipId);
      this.cancelled.delete(clipId);
    }
  }
}