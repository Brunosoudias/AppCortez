import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { copyFile, mkdir, readFile, writeFile } from 'fs/promises';
import type {
  Clip,
  ClipAspectRatio,
  ClipLayout,
  Job,
  Transcript,
  TranscriptAnalysis,
} from '@ai-video-cutter/shared-types';
import {
  ANALYSIS_FILENAME,
  CAPTIONS_ASS_FILENAME,
  CAPTIONS_SRT_FILENAME,
  TRANSCRIPT_FILENAME,
} from '../../common/utils/constants';
import { StorageService } from '../../common/storage/storage.service';
import { ProjectsService } from '../projects/projects.service';
import { ClipsService } from '../clips/clips.service';
import { JobQueueService } from '../jobs/job-queue.service';
import { SettingsService } from '../settings/settings.service';
import { AI_SERVICE, type AiService } from '../processing/interfaces/ai-service.interface';
import {
  TRANSCRIPTION_SERVICE,
  type TranscriptionService,
} from '../processing/interfaces/transcription-service.interface';
import {
  CAPTION_SERVICE,
  type CaptionService,
} from '../processing/interfaces/caption-service.interface';
import { FaceTrackService } from '../processing/services/face-track.service';
import type { CaptionStyle } from '@ai-video-cutter/shared-types';

@Injectable()
export class IntelligenceService implements OnModuleInit {
  private readonly logger = new Logger(IntelligenceService.name);

  constructor(
    private readonly projects: ProjectsService,
    private readonly clips: ClipsService,
    private readonly storage: StorageService,
    private readonly jobs: JobQueueService,
    private readonly settings: SettingsService,
    private readonly faceTrack: FaceTrackService,
    @Inject(TRANSCRIPTION_SERVICE) private readonly transcription: TranscriptionService,
    @Inject(AI_SERVICE) private readonly ai: AiService,
    @Inject(CAPTION_SERVICE) private readonly captions: CaptionService,
  ) {}

  onModuleInit() {
    this.jobs.registerHandler('transcribe', async (job, update) => {
      if (!job.projectId) throw new Error('projectId obrigatório');
      await update({ progress: 10, message: 'Transcrevendo…' });
      const transcript = await this.runTranscribe(job.projectId);
      return { segmentCount: transcript.segments.length, source: transcript.source };
    });

    this.jobs.registerHandler('analyze', async (job, update) => {
      if (!job.projectId) throw new Error('projectId obrigatório');
      await update({ progress: 20, message: 'Analisando transcript…' });
      const analysis = await this.runAnalyze(job.projectId);
      return { highlightCount: analysis.highlights.length, summary: analysis.summary };
    });

    this.jobs.registerHandler('auto-clips', async (job, update) => {
      if (!job.projectId) throw new Error('projectId obrigatório');
      await update({ progress: 15, message: 'Gerando momentos…' });
      const clips = await this.runAutoClips(
        job.projectId,
        {
          maxMoments: job.result?.maxMoments as number | undefined,
          targetDuration: job.result?.targetDuration as number | undefined,
          format: job.result?.format as ClipAspectRatio | undefined,
          layout: job.result?.layout as ClipLayout | undefined,
          render: Boolean(job.result?.render),
          burnCaptions: job.result?.burnCaptions as boolean | undefined,
        },
        update,
        job.id,
      );
      await update({ progress: 95, message: `${clips.length} cortes criados — revise e renderize` });
      return { clipIds: clips.map((c) => c.id), count: clips.length };
    });

    this.jobs.registerHandler('export-batch', async (job, update) => {
      if (!job.projectId) throw new Error('projectId obrigatório');
      await update({ progress: 20, message: 'Exportando cortes…' });
      const files = await this.runExportBatch(job.projectId);
      return { files, count: files.length };
    });

    this.jobs.registerHandler('burn-captions', async (job, update) => {
      if (!job.projectId || !job.clipId) throw new Error('projectId e clipId obrigatórios');
      await update({ progress: 20, message: 'Queimando legendas…' });
      const clip = await this.runBurnCaptions(
        job.projectId,
        job.clipId,
        (job.result?.style as 'srt' | 'ass') || 'ass',
        job.result?.captionStyle as CaptionStyle | undefined,
      );
      return { outputFile: clip.outputFile, captionsFile: clip.captionsFile };
    });

    this.jobs.registerHandler('render', async (job, update) => {
      if (!job.clipId) throw new Error('clipId obrigatório');
      await update({ progress: 5, message: 'Iniciando render…' });
      await this.clips.startRender(job.clipId);
      for (let i = 0; i < 600; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const clip = await this.clips.findById(job.clipId);
        await update({
          progress: Math.max(5, clip.progress ?? 0),
          message: clip.status === 'processing' ? `Renderizando ${clip.progress ?? 0}%` : clip.status,
        });
        if (clip.status === 'completed') {
          return { outputFile: clip.outputFile };
        }
        if (clip.status === 'failed') {
          throw new Error(clip.errorMessage || 'Render falhou');
        }
      }
      throw new Error('Timeout no render');
    });
  }

  enqueueTranscribe(projectId: string): Promise<Job> {
    return this.jobs.enqueue({ type: 'transcribe', projectId, message: 'Na fila: transcrição' });
  }

  enqueueAnalyze(projectId: string): Promise<Job> {
    return this.jobs.enqueue({ type: 'analyze', projectId, message: 'Na fila: análise IA' });
  }

  enqueueAutoClips(
    projectId: string,
    opts: {
      maxMoments?: number;
      targetDuration?: number;
      format?: ClipAspectRatio;
      layout?: ClipLayout;
      render?: boolean;
      burnCaptions?: boolean;
    } = {},
  ): Promise<Job> {
    return this.jobs.enqueue({
      type: 'auto-clips',
      projectId,
      message: 'Na fila: cortes automáticos',
      result: { ...opts },
    });
  }

  enqueueExportBatch(projectId: string): Promise<Job> {
    return this.jobs.enqueue({ type: 'export-batch', projectId, message: 'Na fila: exportação em lote' });
  }

  enqueueBurnCaptions(
    projectId: string,
    clipId: string,
    format: 'srt' | 'ass' = 'ass',
    captionStyle?: CaptionStyle,
  ): Promise<Job> {
    return this.jobs.enqueue({
      type: 'burn-captions',
      projectId,
      clipId,
      message: 'Na fila: burn-in de legendas',
      result: { style: format, captionStyle },
    });
  }

  enqueueRender(projectId: string, clipId: string): Promise<Job> {
    return this.jobs.enqueue({
      type: 'render',
      projectId,
      clipId,
      message: 'Na fila: render de corte',
    });
  }

  async getTranscript(projectId: string): Promise<Transcript> {
    await this.projects.findById(projectId);
    try {
      const raw = await readFile(this.transcriptPath(projectId), 'utf-8');
      return JSON.parse(raw) as Transcript;
    } catch {
      throw new NotFoundException('Transcript ainda não gerado. Execute a transcrição primeiro.');
    }
  }

  async getAnalysis(projectId: string): Promise<TranscriptAnalysis> {
    await this.projects.findById(projectId);
    try {
      const raw = await readFile(this.analysisPath(projectId), 'utf-8');
      return JSON.parse(raw) as TranscriptAnalysis;
    } catch {
      throw new NotFoundException('Análise ainda não gerada.');
    }
  }

  async ensureCaptions(
    projectId: string,
    captionStyle?: CaptionStyle,
  ): Promise<{ srt: string; ass: string; style: string }> {
    const transcript = await this.getTranscript(projectId);
    const settings = await this.settings.get();
    const style = captionStyle ?? settings.captionStyle ?? 'reels';
    const dir = this.storage.getProjectDir(projectId);
    const srtPath = this.storage.resolveSafePath(dir, CAPTIONS_SRT_FILENAME);
    const assPath = this.storage.resolveSafePath(dir, CAPTIONS_ASS_FILENAME);
    await writeFile(srtPath, await this.captions.generateSrt(transcript), 'utf-8');
    await writeFile(assPath, await this.captions.generateAss(transcript, { style }), 'utf-8');
    return { srt: CAPTIONS_SRT_FILENAME, ass: CAPTIONS_ASS_FILENAME, style };
  }

  async getCaptionFile(projectId: string, kind: 'srt' | 'ass'): Promise<string> {
    await this.projects.findById(projectId);
    const name = kind === 'srt' ? CAPTIONS_SRT_FILENAME : CAPTIONS_ASS_FILENAME;
    const path = this.storage.resolveSafePath(this.storage.getProjectDir(projectId), name);
    try {
      return await readFile(path, 'utf-8');
    } catch {
      await this.ensureCaptions(projectId);
      return readFile(path, 'utf-8');
    }
  }

  async getFaceTrack(projectId: string, startTime?: number, endTime?: number) {
    const project = await this.projects.findById(projectId);
    if (!project.originalFile) {
      throw new BadRequestException('Projeto sem vídeo');
    }
    const start = startTime ?? 0;
    const end = endTime ?? project.duration ?? start + 10;
    const inputPath = this.projects.getOriginalFilePath(project);
    const result = await this.faceTrack.analyze(inputPath, start, end, 10);
    return {
      averageX: result.averageX,
      averageSecondaryX: result.averageSecondaryX,
      points: result.points,
      smoothed: result.smoothed,
    };
  }

  private async runTranscribe(projectId: string): Promise<Transcript> {
    const project = await this.projects.findById(projectId);
    if (!project.originalFile) {
      throw new BadRequestException('Projeto sem vídeo original');
    }

    await this.projects.update(projectId, { status: 'analyzing' });
    const settings = await this.settings.get();
    const videoPath = this.projects.getOriginalFilePath(project);

    const transcript = await this.transcription.transcribe(videoPath, {
      projectId,
      language: settings.language,
      mode: settings.whisperMode,
    });

    await writeFile(this.transcriptPath(projectId), JSON.stringify(transcript, null, 2), 'utf-8');
    await this.ensureCaptions(projectId);
    await this.projects.update(projectId, {
      status: 'completed',
      transcriptFile: TRANSCRIPT_FILENAME,
    });

    this.logger.log(`Transcript ${projectId}: ${transcript.segments.length} segmentos (${transcript.source})`);
    return transcript;
  }

  private async runAnalyze(projectId: string): Promise<TranscriptAnalysis> {
    const transcript = await this.getTranscript(projectId);
    await this.projects.update(projectId, { status: 'analyzing' });
    const analysis = await this.ai.analyzeTranscript(transcript.segments);
    await writeFile(this.analysisPath(projectId), JSON.stringify(analysis, null, 2), 'utf-8');
    await this.projects.update(projectId, {
      status: 'completed',
      analysisSummary: analysis.summary,
    });
    return analysis;
  }

  private async runAutoClips(
    projectId: string,
    opts: {
      maxMoments?: number;
      targetDuration?: number;
      format?: ClipAspectRatio;
      layout?: ClipLayout;
      render?: boolean;
      burnCaptions?: boolean;
    },
    update?: (patch: Partial<Job>) => Promise<unknown>,
    jobId?: string,
  ): Promise<Clip[]> {
    const assertActive = () => {
      if (jobId && this.jobs.isCancelled(jobId)) {
        throw new Error('Job cancelado pelo usuário');
      }
    };

    const project = await this.projects.findById(projectId);
    const settings = await this.settings.get();
    assertActive();

    let transcript: Transcript;
    let transcriptRefreshed = false;
    try {
      transcript = await this.getTranscript(projectId);
      // Heurística não tem fala real — retranscreve com Whisper local/API
      if (
        transcript.source === 'heuristic' ||
        transcript.segments.some((s) =>
          /OPENAI_API_KEY|sem fala reconhecida|Whisper CLI|modelo Whisper/i.test(s.text),
        )
      ) {
        await update?.({ progress: 18, message: 'Transcrevendo fala real (PT-BR)…' });
        assertActive();
        transcript = await this.runTranscribe(projectId);
        transcriptRefreshed = true;
      }
    } catch (err) {
      if (/cancelad/i.test((err as Error).message || '')) throw err;
      await update?.({ progress: 20, message: 'Transcrevendo em português (BR)…' });
      assertActive();
      transcript = await this.runTranscribe(projectId);
      transcriptRefreshed = true;
    }

    assertActive();
    let analysis: TranscriptAnalysis | null = null;
    if (!transcriptRefreshed) {
      try {
        analysis = await this.getAnalysis(projectId);
        // Análise antiga gerada com placeholders — reanalisa com a fala real
        if (
          analysis.highlights.some((h) => /\[Segmento\s*\d+\]|OPENAI_API_KEY|sem fala reconhecida/i.test(h.title || ''))
        ) {
          analysis = null;
        }
      } catch {
        analysis = null;
      }
    }

    if (!analysis) {
      await update?.({ progress: 35, message: 'Analisando momentos com a fala real…' });
      assertActive();
      analysis = await this.runAnalyze(projectId);
    }

    assertActive();
    const moments = await this.ai.findBestMoments({
      transcript: transcript.segments,
      duration: project.duration ?? transcript.segments.at(-1)?.end ?? 60,
      maxMoments: opts.maxMoments ?? settings.maxAutoClips,
      targetDuration: opts.targetDuration ?? settings.defaultClipDuration,
    });

    if (!moments.length) {
      throw new BadRequestException('Nenhum momento relevante encontrado na transcrição');
    }

    const format = opts.format ?? settings.defaultClipFormat;
    const layout = opts.layout ?? (format === '9:16' ? 'blur' : 'crop');
    const shouldRender = Boolean(opts.render);
    const shouldBurn =
      shouldRender &&
      (opts.burnCaptions !== undefined ? opts.burnCaptions : settings.burnCaptionsByDefault);

    if (shouldBurn) {
      assertActive();
      await this.ensureCaptions(projectId, settings.captionStyle);
    }

    const created: Clip[] = [];
    const maxClips = opts.maxMoments ?? settings.maxAutoClips;
    const selected: typeof moments = [];
    for (const moment of moments) {
      if (selected.length >= maxClips) break;
      const dup = selected.some(
        (s) =>
          Math.abs(s.startTime - moment.startTime) < 2 &&
          Math.abs(s.endTime - moment.endTime) < 2,
      );
      if (dup) continue;
      selected.push(moment);
    }

    for (let i = 0; i < selected.length; i++) {
      assertActive();
      const moment = selected[i];
      const windowSegs = transcript.segments.filter(
        (s) => s.end > moment.startTime && s.start < moment.endTime,
      );
      const realSpeech = windowSegs
        .map((s) => s.text)
        .filter((t) => t && !/\[Segmento\s*\d+\]|OPENAI_API_KEY|sem fala reconhecida/i.test(t))
        .join(' ');
      const windowText = realSpeech || windowSegs.map((s) => s.text).join(' ');

      let title = moment.title?.trim();
      if (!title || /\[Segmento\s*\d+\]|OPENAI_API_KEY|sem fala reconhecida/i.test(title)) {
        title = await this.ai.generateClipTitle(windowText, {
          startTime: moment.startTime,
          endTime: moment.endTime,
        });
      }

      let clip = await this.clips.create(projectId, {
        startTime: moment.startTime,
        endTime: moment.endTime,
        format,
        layout,
        title,
        score: moment.score,
        reason: moment.reason,
      });

      if (shouldRender) {
        const baseProgress = 40 + Math.floor((i / Math.max(selected.length, 1)) * 50);
        await update?.({
          progress: baseProgress,
          message: `Renderizando corte ${i + 1}/${selected.length}…`,
        });
        assertActive();
        await this.clips.startRender(clip.id);
        clip = await this.waitForClipRender(clip.id, 10 * 60_000, jobId);

        if (shouldBurn && clip.status === 'completed') {
          assertActive();
          await update?.({
            progress: Math.min(94, baseProgress + 5),
            message: `Legendas PT-BR no corte ${i + 1}/${selected.length}…`,
          });
          clip = await this.runBurnCaptions(projectId, clip.id, 'ass', settings.captionStyle);
        }
      }

      created.push(clip);
    }

    return created;
  }

  private async waitForClipRender(
    clipId: string,
    timeoutMs = 10 * 60_000,
    jobId?: string,
  ): Promise<Clip> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (jobId && this.jobs.isCancelled(jobId)) {
        throw new Error('Job cancelado pelo usuário');
      }
      await new Promise((r) => setTimeout(r, 500));
      const clip = await this.clips.findById(clipId);
      if (clip.status === 'completed') return clip;
      if (clip.status === 'failed') {
        throw new Error(clip.errorMessage || `Render do corte ${clipId} falhou`);
      }
    }
    throw new Error(`Timeout no render do corte ${clipId}`);
  }

  private async runExportBatch(projectId: string): Promise<string[]> {
    const clips = await this.clips.findAllByProject(projectId);
    const completed = clips.filter((c) => c.status === 'completed' && c.outputFile);
    if (!completed.length) {
      throw new BadRequestException('Nenhum corte renderizado para exportar');
    }

    const exportDir = this.storage.getProjectExportsDir(projectId);
    await mkdir(exportDir, { recursive: true });
    const files: string[] = [];

    for (const clip of completed) {
      const src = this.clips.getOutputFilePath(clip);
      const destName = `${(clip.title || clip.id).replace(/[^\w\-]+/g, '_').slice(0, 40) || clip.id}.mp4`;
      const dest = this.storage.resolveSafePath(exportDir, destName);
      await copyFile(src, dest);
      files.push(`exports/${destName}`);
    }

    return files;
  }

  private async runBurnCaptions(
    projectId: string,
    clipId: string,
    format: 'srt' | 'ass',
    captionStyle?: CaptionStyle,
  ): Promise<Clip> {
    const settings = await this.settings.get();
    const style = captionStyle ?? settings.captionStyle ?? 'reels';
    await this.ensureCaptions(projectId, style);

    const clip = await this.clips.findById(clipId);
    if (!clip.outputFile) {
      throw new BadRequestException('Renderize o corte antes de queimar legendas');
    }

    const transcript = await this.getTranscript(projectId);
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

    const tempCap = this.storage.resolveSafePath(this.storage.getTempDir(), `${clip.id}.${format}`);
    await writeFile(
      tempCap,
      format === 'ass'
        ? await this.captions.generateAss(clipped, { style })
        : await this.captions.generateSrt(clipped),
      'utf-8',
    );

    const outName = `${clip.id}.captioned.mp4`;
    const outputPath = this.storage.resolveSafePath(this.storage.getProjectClipsDir(projectId), outName);
    await this.captions.burnCaptions(this.clips.getOutputFilePath(clip), tempCap, outputPath);

    return this.clips.update(clipId, {
      outputFile: `clips/${outName}`,
      captionsFile: format === 'ass' ? CAPTIONS_ASS_FILENAME : CAPTIONS_SRT_FILENAME,
      status: 'completed',
    });
  }

  private transcriptPath(projectId: string): string {
    return this.storage.resolveSafePath(this.storage.getProjectDir(projectId), TRANSCRIPT_FILENAME);
  }

  private analysisPath(projectId: string): string {
    return this.storage.resolveSafePath(this.storage.getProjectDir(projectId), ANALYSIS_FILENAME);
  }
}
