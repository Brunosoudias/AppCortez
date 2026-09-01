// Precisa ser o primeiro import: popula process.env a partir do .env da raiz
// do monorepo ANTES que qualquer outro módulo (ex: controllers que configuram
// multer com base em variáveis de ambiente) seja avaliado.
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
loadEnv({ path: resolve(__dirname, '../../../.env') });

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ensureStorageStructure } from './common/utils/ensure-storage.util';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Garante que a árvore de pastas storage/ exista antes de aceitar requisições.
  const storagePath = configService.get<string>('app.storagePath')!;
  await ensureStorageStructure(storagePath);

  const frontendUrl = configService.get<string>('app.frontendUrl')!;
  app.enableCors({ origin: frontendUrl, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  const port = configService.get<number>('app.port')!;
  await app.listen(port);

  logger.log(`🚀 Backend rodando em http://localhost:${port}`);
  logger.log(`📁 Storage em ${storagePath}`);
}

bootstrap();
