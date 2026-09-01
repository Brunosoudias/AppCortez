'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { useProject } from '@/hooks/useProject';
import { useClips } from '@/hooks/useClips';
import { projectsApi, clipsApi, jobsApi, settingsApi, waitForJob } from '@/services/api';
import { useToast } from '@/components/layout/ToastProvider';
import { PROJECT_STATUS_COLOR, PROJECT_STATUS_LABEL, cn } from '@/lib/utils';
import { VideoPlayer } from '@/components/video/VideoPlayer';
import { ClipCreator } from '@/components/clips/ClipCreator';
import { ClipList } from '@/components/clips/ClipList';
import { CaptionsPanel } from '@/components/captions/CaptionsPanel';
import { TranscriptPanel } from '@/components/video/TranscriptPanel';
import { FaceTrackPanel } from '@/components/video/FaceTrackPanel';
import { AiActionsPanel } from '@/components/projects/AiActionsPanel';
import type { ClipAspectRatio, ClipLayout, Transcript, TranscriptAnalysis } from '@/types';

export default function ProjectEditorPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const { project, loading, error, retryDownload, refetch } = useProject(projectId);
  const { clips, createClip, renderClip, deleteClip, cancelClip, cancelPending, toggleCaptions, setClipLayout, refetch: refetchClips } =
    useClips(projectId);
  const { push } = useToast();

  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [startMark, setStartMark] = useState<number | null>(null);
  const [endMark, setEndMark] = useState<number | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [analysis, setAnalysis] = useState<TranscriptAnalysis | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [captionsReady, setCaptionsReady] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [jobMessage, setJobMessage] = useState<string | null>(null);
  const [cropGuideX, setCropGuideX] = useState(0.42);
  const [cropGuideXBottom, setCropGuideXBottom] = useState(0.62);
  const [cropManualLock, setCropManualLock] = useState(false);
  const [faceTrackingEnabled, setFaceTrackingEnabled] = useState(true);
  const [previewLayout, setPreviewLayout] = useState<ClipLayout>('title');

  const activeCaption =
    transcript?.segments.find((s) => currentTime >= s.start && currentTime < s.end)?.text ?? null;

  useEffect(() => {
    settingsApi
      .get()
      .then((s) => setFaceTrackingEnabled(s.faceTrackingEnabled))
      .catch(() => undefined);
  }, []);

  const loadTranscript = useCallback(async () => {
    setTranscriptLoading(true);
    try {
      const t = await projectsApi.transcript(projectId);
      setTranscript(t);
      setCaptionsReady(true);
    } catch {
      setTranscript(null);
    } finally {
      setTranscriptLoading(false);
    }
  }, [projectId]);

  const loadAnalysis = useCallback(async () => {
    try {
      const a = await projectsApi.analysis(projectId);
      setAnalysis(a);
    } catch {
      setAnalysis(null);
    }
  }, [projectId]);

  useEffect(() => {
    void loadTranscript();
    void loadAnalysis();
  }, [loadTranscript, loadAnalysis]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onLoadedMetadata = () => setDuration(video.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
    };
  }, [project?.originalFile]);

  function handleSeek(time: number) {
    if (videoRef.current) videoRef.current.currentTime = time;
    setCurrentTime(time);
  }

  async function handleCreateClip(
    start: number,
    end: number,
    format: ClipAspectRatio,
    options?: { layout?: ClipLayout; title?: string; titleCta?: string },
  ) {
    const layout = options?.layout ?? (format === '9:16' ? previewLayout : 'crop');
    if (format === '9:16' && options?.layout) setPreviewLayout(options.layout);
    await createClip({
      startTime: start,
      endTime: end,
      format,
      layout,
      title: options?.title,
      titleCta: options?.titleCta,
      cropCenterX: cropGuideX,
      cropCenterXBottom: layout === 'stack' ? cropGuideXBottom : undefined,
    });
    setStartMark(null);
    setEndMark(null);
  }

  async function handleApplyFramingToClips() {
    const result = await clipsApi.applyFramingToProject(projectId, {
      cropCenterX: cropGuideX,
      cropCenterXBottom: cropGuideXBottom,
    });
    setCropManualLock(true);
    await refetchClips();
    push({
      kind: 'success',
      title: 'Enquadramento aplicado',
      description: `${result.updated} corte(s). Re-renderize para ver o novo crop.`,
    });
  }

  async function handleFollowSpeakerOnClips() {
    const result = await clipsApi.applyFramingToProject(projectId, {
      cropCenterX: null,
      cropCenterXBottom: null,
    });
    setCropManualLock(false);
    await refetchClips();
    push({
      kind: 'success',
      title: 'Cortes seguirão quem fala',
      description: `${result.updated} corte(s). Re-renderize para centralizar no falante.`,
    });
  }

  async function runJob(start: () => Promise<{ id: string }>, after?: () => Promise<void>) {
    setAiBusy(true);
    setJobMessage('Enfileirando…');
    const pollClips = setInterval(() => {
      void refetchClips();
    }, 2000);
    try {
      const job = await start();
      const done = await waitForJob(job.id, (j) => {
        setJobMessage(j.message || `${j.status} (${j.progress}%)`);
      });
      if (done.status === 'failed') {
        throw new Error(done.errorMessage || 'Job falhou');
      }
      await after?.();
      await refetch();
      await refetchClips();
    } finally {
      clearInterval(pollClips);
      setAiBusy(false);
      setJobMessage(null);
    }
  }

  async function handleRetryDownload() {
    setRetrying(true);
    setRetryError(null);
    try {
      await retryDownload();
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : 'Falha ao reiniciar download');
    } finally {
      setRetrying(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center gap-2 text-sm text-zinc-500">
        <Loader2 size={16} className="animate-spin" /> Carregando projeto…
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-sm text-red-400">{error ?? 'Projeto não encontrado'}</p>
        <Link href="/projects" className="btn-secondary mt-4 inline-flex">
          <ArrowLeft size={16} /> Voltar para projetos
        </Link>
      </div>
    );
  }

  const videoReady = project.status === 'completed' && !!project.originalFile;
  const isIngesting = project.status === 'downloading' || project.status === 'processing';

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/projects" className="mb-2 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300">
            <ArrowLeft size={13} /> Projetos
          </Link>
          <h1 className="text-xl font-semibold text-white">{project.name}</h1>
          {project.sourceUrl && (
            <p className="mt-1 max-w-xl truncate text-xs text-zinc-600" title={project.sourceUrl}>
              {project.sourceUrl}
            </p>
          )}
        </div>
        <span className={cn('badge', PROJECT_STATUS_COLOR[project.status])}>
          {PROJECT_STATUS_LABEL[project.status]}
        </span>
      </div>

      {!videoReady && (
        <div className="card mb-6 flex items-start gap-3 p-5">
          {isIngesting ? (
            <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-brand-400" />
          ) : (
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-400" />
          )}
          <div className="min-w-0 flex-1 text-sm text-zinc-400">
            {project.status === 'downloading' && <>Baixando vídeo da URL…</>}
            {project.status === 'processing' && <>Processando vídeo com FFmpeg…</>}
            {project.status === 'analyzing' && <>Analisando / transcrevendo…</>}
            {project.status === 'failed' && (
              <>Falha ao obter o vídeo{project.errorMessage ? `: ${project.errorMessage}` : '.'}</>
            )}
            {project.status === 'created' && project.sourceType === 'url' && (
              <>O download ainda não começou. Use o botão abaixo para iniciar.</>
            )}
            {project.status === 'created' && project.sourceType === 'upload' && (
              <>Envie um arquivo de vídeo para este projeto para continuar.</>
            )}
            {(retryError || (project.status === 'failed' && project.sourceType === 'url')) && (
              <div className="mt-3">
                {retryError && <p className="mb-2 text-xs text-red-400">{retryError}</p>}
                {project.sourceType === 'url' && (
                  <button onClick={handleRetryDownload} disabled={retrying} className="btn-secondary !py-1.5 text-xs">
                    {retrying ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    Tentar baixar de novo
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {videoReady && (
        <div className="space-y-6">
          <VideoPlayer
            src={projectsApi.videoStreamUrl(project.id)}
            videoRef={videoRef}
            currentTime={currentTime}
            duration={duration || project.duration || 0}
            playing={playing}
            onSeek={handleSeek}
            startMark={startMark}
            endMark={endMark}
            captionText={activeCaption}
            cropGuideX={cropGuideX}
            cropGuideXBottom={cropGuideXBottom}
            showCropGuide
            cropGuideEditable
            showBottomGuide={previewLayout === 'stack'}
            onCropGuideChange={(x) => {
              setCropManualLock(true);
              setCropGuideX(x);
            }}
            onCropGuideBottomChange={(x) => {
              setCropManualLock(true);
              setCropGuideXBottom(x);
            }}
          />

          <AiActionsPanel
            busy={aiBusy}
            jobMessage={jobMessage}
            hasTranscript={Boolean(transcript)}
            hasAnalysis={Boolean(analysis)}
            analysisSummary={analysis?.summary ?? project.analysisSummary}
            videoReady={videoReady}
            onTranscribe={() =>
              runJob(
                () => projectsApi.transcribe(projectId),
                async () => {
                  await loadTranscript();
                },
              )
            }
            onAnalyze={() =>
              runJob(
                () => projectsApi.analyze(projectId),
                async () => {
                  await loadAnalysis();
                },
              )
            }
            onGenerateViralClips={() =>
              runJob(
                () =>
                  projectsApi.autoClips(projectId, {
                    render: true,
                    format: '9:16',
                    layout: 'title',
                    burnCaptions: true,
                  }),
                async () => {
                  await loadAnalysis();
                  await loadTranscript();
                  setCaptionsReady(true);
                  await refetchClips();
                },
              )
            }
            onExportBatch={async () => {
              await runJob(() => projectsApi.exportBatch(projectId));
            }}
          />

          <ClipList
            clips={clips}
            generating={aiBusy}
            onRender={renderClip}
            onToggleCaptions={async (clipId, enabled) => {
              const updated = await toggleCaptions(clipId, enabled);
              push({
                kind: 'success',
                title: enabled ? 'Legendas ativadas' : 'Legendas desativadas',
                description: enabled
                  ? 'O MP4 deste corte inclui legendas PT-BR.'
                  : 'O MP4 deste corte ficou sem legendas queimadas.',
              });
              return updated;
            }}
            onSetLayout={async (clipId, layout) => {
              const updated = await setClipLayout(clipId, layout);
              push({
                kind: 'info',
                title: 'Layout alterado',
                description:
                  layout === 'title'
                    ? 'Re-renderizando com vídeo em cima e descrição embaixo…'
                    : 'Re-renderizando em 9:16 completo…',
              });
              return updated;
            }}
            onDelete={async (clipId) => {
              await deleteClip(clipId);
            }}
            onCancel={async (clipId) => {
              await cancelClip(clipId);
              push({ kind: 'info', title: 'Corte cancelado' });
            }}
            onCancelPending={async () => {
              // Cancela job de cortes automáticos se estiver rodando
              try {
                const jobs = await jobsApi.list(projectId);
                for (const job of jobs) {
                  if (
                    (job.type === 'auto-clips' || job.type === 'render' || job.type === 'burn-captions') &&
                    (job.status === 'running' || job.status === 'queued')
                  ) {
                    await jobsApi.cancel(job.id);
                  }
                }
              } catch {
                // ignore
              }
              const result = await cancelPending();
              push({
                kind: 'info',
                title: 'Pendentes cancelados',
                description: `${result.cancelled} corte(s) interrompido(s)`,
              });
            }}
          />

          <ClipCreator
            startMark={startMark}
            endMark={endMark}
            currentTime={currentTime}
            layout={previewLayout}
            onLayoutChange={setPreviewLayout}
            onMarkStart={() => setStartMark(currentTime)}
            onMarkEnd={() => setEndMark(currentTime)}
            onCreateClip={handleCreateClip}
          />

          <TranscriptPanel
            transcript={transcript}
            loading={transcriptLoading}
            currentTime={currentTime}
            onSeek={handleSeek}
          />

          <CaptionsPanel
            projectId={projectId}
            transcript={transcript}
            captionsReady={captionsReady}
            onGenerate={async (style) => {
              await projectsApi.captions(projectId, style);
              setCaptionsReady(true);
            }}
          />

          <FaceTrackPanel
            projectId={projectId}
            currentTime={currentTime}
            duration={duration || project.duration || 0}
            enabled={faceTrackingEnabled}
            cropGuideX={cropGuideX}
            cropGuideXBottom={cropGuideXBottom}
            manualLock={cropManualLock}
            onCropGuideX={setCropGuideX}
            onCropGuideBottom={setCropGuideXBottom}
            onManualLockChange={setCropManualLock}
            onApplyToClips={handleApplyFramingToClips}
            onFollowSpeakerOnClips={handleFollowSpeakerOnClips}
          />
        </div>
      )}
    </div>
  );
}
