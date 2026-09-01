import type { Project } from '@ai-video-cutter/shared-types';

/**
 * Contrato de persistência de projetos. A implementação atual
 * (`JsonProjectRepository`) guarda cada projeto como um arquivo
 * storage/projects/{id}/project.json.
 *
 * Trocar para PostgreSQL/Prisma no futuro significa apenas escrever uma
 * `PrismaProjectRepository implements ProjectRepository` e trocar o
 * `provide/useClass` em projects.module.ts — nenhum controller ou service
 * que consome `PROJECT_REPOSITORY` precisa mudar.
 */
export interface ProjectRepository {
  create(project: Project): Promise<Project>;
  findAll(): Promise<Project[]>;
  findById(id: string): Promise<Project | null>;
  update(id: string, patch: Partial<Project>): Promise<Project>;
  delete(id: string): Promise<void>;
}
