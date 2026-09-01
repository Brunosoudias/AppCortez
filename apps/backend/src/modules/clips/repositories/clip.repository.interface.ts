import type { Clip } from '@ai-video-cutter/shared-types';

/**
 * Contrato de persistência de cortes. A implementação atual
 * (`JsonClipRepository`) guarda os cortes de cada projeto em
 * storage/projects/{projectId}/clips.json.
 *
 * Assim como ProjectRepository, pode ser trocada por uma versão baseada em
 * banco de dados no futuro sem impactar controllers/services.
 */
export interface ClipRepository {
  create(clip: Clip): Promise<Clip>;
  findAllByProject(projectId: string): Promise<Clip[]>;
  /** Busca um corte pelo id, sem precisar saber a qual projeto pertence. */
  findById(clipId: string): Promise<Clip | null>;
  update(clipId: string, patch: Partial<Clip>): Promise<Clip>;
  delete(clipId: string): Promise<void>;
}
