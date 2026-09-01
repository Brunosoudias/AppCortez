import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * Módulo global: StorageService fica disponível em qualquer outro módulo
 * sem precisar reimportar StorageModule em cada um deles.
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
