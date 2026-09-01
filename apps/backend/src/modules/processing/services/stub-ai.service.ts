import { Injectable } from '@nestjs/common';
import type {
  BestMoment,
  FindBestMomentsInput,
  TranscriptAnalysis,
  TranscriptSegment,
} from '@ai-video-cutter/shared-types';
import { NotImplementedException } from '../../../common/utils/not-implemented.exception';
import type { AiService } from '../interfaces/ai-service.interface';

/**
 * Implementação placeholder de AiService. Todos os métodos existem para que
 * o resto da aplicação (controllers, testes, frontend) já possa ser escrito
 * contra a interface final — só a lógica de IA real fica pendente para a V2.
 */
@Injectable()
export class StubAiService implements AiService {
  async analyzeTranscript(_transcript: TranscriptSegment[]): Promise<TranscriptAnalysis> {
    throw new NotImplementedException('AiService.analyzeTranscript');
  }

  async findBestMoments(_input: FindBestMomentsInput): Promise<BestMoment[]> {
    throw new NotImplementedException('AiService.findBestMoments');
  }

  async generateClipTitle(_text: string, _opts?: { startTime?: number; endTime?: number }): Promise<string> {
    throw new NotImplementedException('AiService.generateClipTitle');
  }

  async calculateClipScore(_segment: TranscriptSegment): Promise<number> {
    throw new NotImplementedException('AiService.calculateClipScore');
  }
}
