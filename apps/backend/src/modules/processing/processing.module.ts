import { Module } from '@nestjs/common';
import { FfmpegService } from './services/ffmpeg.service';
import { UrlDownloadService } from './services/url-download.service';
import { WhisperTranscriptionService } from './services/whisper-transcription.service';
import { HybridAiService } from './services/hybrid-ai.service';
import { FfmpegCaptionService } from './services/ffmpeg-caption.service';
import { FaceTrackService } from './services/face-track.service';
import { AI_SERVICE } from './interfaces/ai-service.interface';
import { TRANSCRIPTION_SERVICE } from './interfaces/transcription-service.interface';
import { CAPTION_SERVICE } from './interfaces/caption-service.interface';

@Module({
  providers: [
    FfmpegService,
    UrlDownloadService,
    FaceTrackService,
    WhisperTranscriptionService,
    HybridAiService,
    FfmpegCaptionService,
    { provide: AI_SERVICE, useExisting: HybridAiService },
    { provide: TRANSCRIPTION_SERVICE, useExisting: WhisperTranscriptionService },
    { provide: CAPTION_SERVICE, useExisting: FfmpegCaptionService },
  ],
  exports: [
    FfmpegService,
    UrlDownloadService,
    FaceTrackService,
    WhisperTranscriptionService,
    HybridAiService,
    FfmpegCaptionService,
    AI_SERVICE,
    TRANSCRIPTION_SERVICE,
    CAPTION_SERVICE,
  ],
})
export class ProcessingModule {}
