import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  BestMoment,
  FindBestMomentsInput,
  TranscriptAnalysis,
  TranscriptSegment,
} from '@ai-video-cutter/shared-types';
import type { AiService } from '../interfaces/ai-service.interface';
import { cleanSpeechText, formatClock, isPlaceholderSpeech } from './speech-text.util';
import {
  blockToMoment,
  buildContextualBlocks,
  dedupeMoments,
  expandContextWindow,
  filterRealSegments,
  resolveMomentBounds,
  snapMomentToSegments,
} from './clip-moments.util';

const HOT_KEYWORDS = [
  'segredo', 'dica', 'importante', 'nunca', 'sempre', 'erro', 'verdade', 'mito',
  'porque', 'como', 'por que', 'incrível', 'melhor', 'pior', 'atenção', 'cuidado',
  'secret', 'tip', 'important', 'never', 'always', 'mistake', 'truth', 'why', 'how',
  'best', 'worst', 'warning', 'hack', 'viral', 'money', 'dinheiro', 'resultado',
];

/**
 * IA híbrida: usa OpenAI quando há chave; caso contrário, heurística local
 * sobre o transcript (keywords, perguntas, densidade de fala).
 */
@Injectable()
export class HybridAiService implements AiService {
  private readonly logger = new Logger(HybridAiService.name);

  constructor(private readonly config: ConfigService) {}

  async analyzeTranscript(transcript: TranscriptSegment[]): Promise<TranscriptAnalysis> {
    const highlights = await this.findBestMoments({
      transcript,
      duration: transcript.length ? transcript[transcript.length - 1].end : 0,
    });
    const apiKey = this.config.get<string>('app.openaiApiKey') ?? '';

    if (apiKey && transcript.some((s) => !s.text.startsWith('[Segmento'))) {
      try {
        return await this.analyzeWithOpenAi(transcript, highlights, apiKey);
      } catch (err) {
        this.logger.warn(`OpenAI analyze falhou, usando heurística: ${(err as Error).message}`);
      }
    }

    const topics = this.extractTopics(transcript);
    const summary =
      transcript.length === 0
        ? 'Sem transcrição disponível.'
        : `Vídeo com ${transcript.length} segmentos. Destaques detectados: ${highlights.length}. Tópicos: ${topics.slice(0, 5).join(', ') || 'gerais'}.`;

    return { summary, topics, highlights, source: 'heuristic' };
  }

  async findBestMoments(input: FindBestMomentsInput): Promise<BestMoment[]> {
    const { transcript, duration, maxMoments = 8, targetDuration = 45 } = input;
    if (!transcript.length || duration <= 0) return [];

    const apiKey = this.config.get<string>('app.openaiApiKey') ?? '';
    const hasRealText = transcript.some((s) => s.text && !isPlaceholderSpeech(s.text));

    let moments: BestMoment[];
    if (apiKey && hasRealText) {
      try {
        moments = await this.momentsWithOpenAi(transcript, duration, maxMoments, targetDuration, apiKey);
      } catch (err) {
        this.logger.warn(`OpenAI moments falhou, usando heurística: ${(err as Error).message}`);
        moments = this.momentsHeuristic(transcript, duration, maxMoments, targetDuration);
      }
    } else {
      moments = this.momentsHeuristic(transcript, duration, maxMoments, targetDuration);
    }

    const realSegs = filterRealSegments(transcript);
    const pool = realSegs.length ? realSegs : transcript;
    return dedupeMoments(
      moments.map((m) => snapMomentToSegments(m, pool)),
      maxMoments,
    );
  }

  async generateClipTitle(text: string, opts?: { startTime?: number; endTime?: number }): Promise<string> {
    const cleaned = cleanSpeechText(text);
    if (!cleaned || isPlaceholderSpeech(text)) {
      if (typeof opts?.startTime === 'number' && typeof opts?.endTime === 'number') {
        return `Corte ${formatClock(opts.startTime)}–${formatClock(opts.endTime)}`;
      }
      return 'Corte automático';
    }

    const apiKey = this.config.get<string>('app.openaiApiKey') ?? '';
    if (apiKey) {
      try {
        const client = new OpenAI({ apiKey });
        const res = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0.7,
          max_tokens: 40,
          messages: [
            {
              role: 'system',
              content:
                'Gere um título curto e chamativo (máx 12 palavras) em português para um clip de redes sociais. Sem aspas. Baseie-se só no trecho dado.',
            },
            { role: 'user', content: cleaned.slice(0, 500) },
          ],
        });
        const title = res.choices[0]?.message?.content?.trim();
        if (title && !isPlaceholderSpeech(title)) return title.replace(/^["']|["']$/g, '');
      } catch {
        // fallback abaixo
      }
    }

    return this.titleFromSpeech(cleaned, opts?.startTime, opts?.endTime);
  }

  async calculateClipScore(segment: TranscriptSegment): Promise<number> {
    return this.scoreText(segment.text, segment.end - segment.start);
  }

  private momentsHeuristic(
    transcript: TranscriptSegment[],
    duration: number,
    maxMoments: number,
    targetDuration: number,
  ): BestMoment[] {
    if (!transcript.length || duration <= 0) return [];

    const { minDuration, maxDuration } = resolveMomentBounds({ targetDuration, maxMoments });
    const realSegs = filterRealSegments(transcript);
    const segments = realSegs.length ? realSegs : transcript;

    if (duration <= minDuration + 1) {
      const text = segments.map((s) => s.text).join(' ');
      const score = this.scoreText(text, duration);
      return [
        {
          startTime: Number(segments[0].start.toFixed(2)),
          endTime: Number(Math.min(duration, segments[segments.length - 1].end).toFixed(2)),
          score,
          reason: this.buildReason(text, score),
          title: this.titleFromSpeech(text, segments[0].start, duration),
        },
      ];
    }

    const candidates: BestMoment[] = [];

    // Blocos naturais da fala (pausas + fim de frase)
    for (const block of buildContextualBlocks(segments, minDuration, maxDuration)) {
      const text = block.segments.map((s) => s.text).join(' ');
      const dur = block.end - block.start;
      const score = this.scoreText(text, dur);
      candidates.push(
        blockToMoment(block, score, this.buildReason(text, score), this.titleFromSpeech(text, block.start, block.end)),
      );
    }

    // Janelas contextuais em torno dos trechos mais fortes (duração variável)
    const segScores = segments.map((seg, i) => ({
      i,
      score: this.scoreText(seg.text, seg.end - seg.start),
    }));
    segScores.sort((a, b) => b.score - a.score);

    for (const { i } of segScores.slice(0, maxMoments * 4)) {
      const block = expandContextWindow(segments, i, minDuration, maxDuration, targetDuration);
      if (!block) continue;
      const text = block.segments.map((s) => s.text).join(' ');
      const dur = block.end - block.start;
      const score = this.scoreText(text, dur);
      candidates.push(
        blockToMoment(block, score, this.buildReason(text, score), this.titleFromSpeech(text, block.start, block.end)),
      );
    }

    return dedupeMoments(candidates, maxMoments);
  }

  private titleFromSpeech(text: string, start?: number, end?: number): string {
    const cleaned = cleanSpeechText(text);
    if (!cleaned || isPlaceholderSpeech(text)) {
      if (typeof start === 'number' && typeof end === 'number') {
        return `Corte ${formatClock(start)}–${formatClock(end)}`;
      }
      return 'Corte automático';
    }
    const words = cleaned.split(/\s+/).slice(0, 12).join(' ');
    return words.length > 90 ? `${words.slice(0, 87)}…` : words;
  }

  private scoreText(text: string, durationSec: number): number {
    const lower = text.toLowerCase();
    let score = 40;

    for (const kw of HOT_KEYWORDS) {
      if (lower.includes(kw)) score += 6;
    }
    if (text.includes('?')) score += 10;
    if (text.includes('!')) score += 6;
    const words = text.split(/\s+/).filter(Boolean).length;
    const density = durationSec > 0 ? words / durationSec : 0;
    if (density > 1.5 && density < 4) score += 12;
    if (durationSec >= 10 && durationSec <= 90) score += 6;
    if (durationSec >= 18 && durationSec <= 75) score += 4;
    if (isPlaceholderSpeech(text)) score = Math.min(score, 45);

    return Math.max(1, Math.min(100, Math.round(score)));
  }

  private buildReason(text: string, score: number): string {
    const lower = text.toLowerCase();
    const hits = HOT_KEYWORDS.filter((k) => lower.includes(k)).slice(0, 3);
    if (hits.length) return `Alto engajamento potencial (score ${score}): termos ${hits.join(', ')}`;
    if (text.includes('?')) return `Trecho com pergunta (score ${score}) — bom gancho`;
    return `Densidade de fala e ritmo favoráveis (score ${score})`;
  }

  private extractTopics(transcript: TranscriptSegment[]): string[] {
    const bag = new Map<string, number>();
    const stop = new Set([
      'a', 'o', 'os', 'as', 'de', 'da', 'do', 'e', 'que', 'em', 'um', 'uma', 'para', 'com', 'não', 'na', 'no',
      'the', 'and', 'to', 'of', 'in', 'is', 'it', 'you', 'that', 'for', 'on', 'are', 'this', 'was',
    ]);
    for (const seg of transcript) {
      for (const w of seg.text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)) {
        if (w.length < 4 || stop.has(w) || w.startsWith('segmento')) continue;
        bag.set(w, (bag.get(w) ?? 0) + 1);
      }
    }
    return [...bag.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([w]) => w);
  }

  private async analyzeWithOpenAi(
    transcript: TranscriptSegment[],
    highlights: BestMoment[],
    apiKey: string,
  ): Promise<TranscriptAnalysis> {
    const client = new OpenAI({ apiKey });
    const text = transcript.map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`).join('\n').slice(0, 12000);
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Analise a transcrição de um vídeo e retorne JSON: {"summary": string, "topics": string[]}. Em português.',
        },
        { role: 'user', content: text },
      ],
    });
    const raw = res.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as { summary?: string; topics?: string[] };
    return {
      summary: parsed.summary ?? 'Análise concluída.',
      topics: parsed.topics ?? [],
      highlights,
      source: 'openai',
    };
  }

  private async momentsWithOpenAi(
    transcript: TranscriptSegment[],
    duration: number,
    maxMoments: number,
    targetDuration: number,
    apiKey: string,
  ): Promise<BestMoment[]> {
    const client = new OpenAI({ apiKey });
    const text = transcript.map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`).join('\n').slice(0, 12000);
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Você é um editor de vídeos virais. Dado um transcript com timestamps, escolha até ${maxMoments} melhores momentos para Shorts/Reels.

Regras importantes:
- Duração VARIÁVEL por trecho (entre 12 e 90 segundos), conforme o contexto — NÃO use sempre ${targetDuration}s.
- Corte apenas em limites naturais: fim de frase, pausa ou mudança de assunto. Nunca corte no meio de uma ideia.
- startTime deve coincidir com o início de um segmento; endTime com o fim de um segmento.
- Cada momento deve ser uma história/trecho completo e compreensível sozinho.

Duração total do vídeo: ${duration}s.
Retorne JSON: {"moments":[{"startTime":number,"endTime":number,"score":number,"reason":string,"title":string}]}. score 0-100. Em português.`,
        },
        { role: 'user', content: text },
      ],
    });
    const raw = res.choices[0]?.message?.content ?? '{"moments":[]}';
    const parsed = JSON.parse(raw) as { moments?: BestMoment[] };
    return (parsed.moments ?? [])
      .filter((m) => m.endTime > m.startTime)
      .map((m) => ({
        startTime: Number(m.startTime),
        endTime: Number(m.endTime),
        score: Math.max(1, Math.min(100, Number(m.score) || 50)),
        reason: m.reason || 'Selecionado pela IA',
        title: m.title,
      }))
      .slice(0, maxMoments);
  }
}
