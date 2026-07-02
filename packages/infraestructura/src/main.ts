import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { validarConfiguracionArranque } from './configuracion/validar-configuracion-arranque';

// Identidad simulada para Fase 3A; no es autenticación real.
// Los endpoints leen el usuario del header x-usuario-id (placeholder inseguro).
async function bootstrap(): Promise<void> {
  const configuracion = validarConfiguracionArranque();

  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(configuracion.puerto);
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Fallo el arranque de la aplicación:', error);
  process.exitCode = 1;
});
