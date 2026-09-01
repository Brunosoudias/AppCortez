const PLACEHOLDER_SPEECH_RE =
  /\[Segmento\s*\d+\]|sem fala reconhecida|OPENAI_API_KEY|modelo Whisper|falta modelo Whisper|Whisper CLI/i;

export function isPlaceholderSpeech(text: string | undefined | null): boolean {
  return Boolean(text && PLACEHOLDER_SPEECH_RE.test(text));
}

/** Remove placeholders de transcrição heurística e normaliza espaços. */
export function cleanSpeechText(text: string): string {
  return text
    .replace(/\[Segmento\s*\d+\][^.!\n]*(?:[.!]\s*|$)/gi, ' ')
    .replace(/Trecho\s+\d+\s*s\s*[–\-]\s*\d+\s*s[^.!\n]*(?:[.!]\s*|$)/gi, ' ')
    .replace(/sem fala reconhecida[^.!\n]*(?:[.!]\s*|$)/gi, ' ')
    .replace(/configure OPENAI_API_KEY[^.!\n]*(?:[.!]\s*|$)/gi, ' ')
    .replace(/falta modelo Whisper[^.!\n]*(?:[.!]\s*|$)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}
