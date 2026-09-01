/**
 * Gera um identificador único (UUID v4). Usado para ids de projetos e cortes,
 * mantendo a arquitetura pronta para uma futura chave primária de banco de dados.
 *
 * Usa a Web Crypto API global (disponível tanto no Node.js 19+ quanto no
 * navegador) para que este módulo possa ser importado com segurança tanto
 * pelo backend quanto pelo frontend.
 */
export function generateId(): string {
  return globalThis.crypto.randomUUID();
}
