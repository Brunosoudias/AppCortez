import { resolve } from 'path';

/**
 * Lê o caminho de storage diretamente de process.env.
 *
 * Existe separadamente do ConfigService porque decorators do NestJS
 * (ex: `@UseInterceptors(FileInterceptor('file', { storage: diskStorage(...) }))`)
 * são avaliados na importação do módulo, antes do container de DI estar
 * disponível. As variáveis de ambiente já foram carregadas pelo dotenv
 * nesse ponto, então esta função lê a mesma fonte de verdade usada por
 * `config/configuration.ts`.
 */
export function getStorageRootFromEnv(): string {
  return resolve(process.cwd(), process.env.STORAGE_PATH ?? '../../storage');
}
