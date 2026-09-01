import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import type { ApiErrorResponse } from '@ai-video-cutter/shared-types';

/**
 * Filtro global de exceções. Padroniza o formato de erro da API e garante
 * que erros inesperados (ex: exceções cruas do FFmpeg com caminhos absolutos
 * do sistema de arquivos) nunca vazem detalhes internos para o cliente.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Erro interno do servidor';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const parsed = body as { message?: string | string[]; error?: string };
        message = parsed.message ?? exception.message;
        error = parsed.error ?? error;
      }
      if (status !== HttpStatus.INTERNAL_SERVER_ERROR) {
        error = error === 'Internal Server Error' ? HttpStatus[status] : error;
      }
    } else if (exception instanceof Error) {
      // Nunca expõe exception.message de erros não tratados (pode conter
      // caminhos de arquivo internos, ex: stderr do FFmpeg). Fica só no log.
      this.logger.error(exception.message, exception.stack);
    } else {
      this.logger.error('Erro desconhecido', String(exception));
    }

    const payload: ApiErrorResponse = {
      statusCode: status,
      message,
      error,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(payload);
  }
}
