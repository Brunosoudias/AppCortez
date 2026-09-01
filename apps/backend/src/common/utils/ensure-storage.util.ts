import { mkdir } from 'fs/promises';
import { join } from 'path';

const TOP_LEVEL_DIRS = ['originals', 'temp', 'audio', 'transcripts', 'clips', 'exports', 'projects'];

/**
 * Cria a árvore de pastas storage/ (idempotente) caso ainda não exista.
 * Chamado uma vez na inicialização do backend (ver main.ts).
 */
export async function ensureStorageStructure(storageRoot: string): Promise<void> {
  await Promise.all(TOP_LEVEL_DIRS.map((dir) => mkdir(join(storageRoot, dir), { recursive: true })));
}
