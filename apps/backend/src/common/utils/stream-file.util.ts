import { NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';

/**
 * Envia um arquivo local via HTTP suportando "Range" requests, necessário
 * para o player de vídeo do frontend conseguir buscar (seek) sem baixar o
 * arquivo inteiro primeiro.
 *
 * `filePath` já deve ter sido validado com `StorageService.resolveSafePath`
 * pelo chamador — esta função não faz nenhuma validação de caminho.
 */
export async function streamFile(
  req: Request,
  res: Response,
  filePath: string,
  contentType: string,
): Promise<void> {
  let size: number;
  try {
    size = (await stat(filePath)).size;
  } catch {
    throw new NotFoundException('Arquivo não encontrado');
  }

  const range = req.headers.range;

  if (!range) {
    res.writeHead(200, {
      'Content-Length': size,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    });
    createReadStream(filePath).pipe(res);
    return;
  }

  const match = /bytes=(\d*)-(\d*)/.exec(range);
  const start = match?.[1] ? parseInt(match[1], 10) : 0;
  const end = match?.[2] ? parseInt(match[2], 10) : size - 1;
  const chunkSize = end - start + 1;

  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${size}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': chunkSize,
    'Content-Type': contentType,
  });

  createReadStream(filePath, { start, end }).pipe(res);
}

const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

export function contentTypeForExtension(ext: string): string {
  return EXTENSION_CONTENT_TYPES[ext.toLowerCase()] ?? 'application/octet-stream';
}
