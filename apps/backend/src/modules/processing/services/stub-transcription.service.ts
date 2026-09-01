import { Injectable } from '@nestjs/common';
import type { Transcript } from '@ai-video-cutter/shared-types';
import { NotImplementedException } from '../../../common/utils/not-implemented.exception';
import type { TranscriptionService } from '../interfaces/transcription-service.interface';

/**
 * Implementação placeholder de TranscriptionService. A V2 trocará esta
 * classe por uma que roda Whisper localmente (via Python ou binding node),
 * sem que nenhum outro módulo precise mudar.
 */
@Injectable()
export class StubTranscriptionService implements TranscriptionService {
  async transcribe(_videoPath: string): Promise<Transcript> {
    throw new NotImplementedException('TranscriptionService.transcribe');
  }
}
