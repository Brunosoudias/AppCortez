import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Lançada por métodos que já existem na interface do serviço (preparados
 * para a V2 — transcrição, IA, legendas, reenquadramento) mas ainda não
 * foram implementados nesta versão.
 */
export class NotImplementedException extends HttpException {
  constructor(feature: string) {
    super(
      {
        statusCode: HttpStatus.NOT_IMPLEMENTED,
        error: 'Not Implemented',
        message: `"${feature}" ainda não foi implementado nesta versão. Planejado para a V2 (ver roadmap no README).`,
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
