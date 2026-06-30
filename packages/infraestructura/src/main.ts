import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// Identidad simulada para Fase 3A; no es autenticación real.
// Los endpoints leen el usuario del header x-usuario-id (placeholder inseguro).
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}

void bootstrap();
