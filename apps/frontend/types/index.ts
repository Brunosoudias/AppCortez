// Re-exporta os tipos compartilhados para que os componentes do frontend
// importem sempre de "@/types", sem precisar saber que eles vêm do pacote
// do monorepo. Facilita trocar/estender tipos localmente no futuro.
export * from '@ai-video-cutter/shared-types';
