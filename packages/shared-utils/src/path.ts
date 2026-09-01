/**
 * Extrai a extensão de um nome de arquivo (com o ponto), em minúsculas.
 * Ex: "Video.MP4" -> ".mp4"
 */
export function getFileExtension(filename: string): string {
  const match = /\.[^./\\]+$/.exec(filename);
  return match ? match[0].toLowerCase() : '';
}

/**
 * Sanitiza um nome de arquivo removendo separadores de diretório e
 * caracteres que poderiam ser usados para path traversal (../, \, etc).
 * Não deve ser usada como única defesa — combine sempre com uma
 * validação de caminho final absoluto (ver `resolveSafePath` no backend).
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[/\\]/g, '')
    .replace(/^\.+/, '')
    .trim();
}
