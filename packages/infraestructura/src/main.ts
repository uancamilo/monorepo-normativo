import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { validarConfiguracionArranque } from './configuracion/validar-configuracion-arranque';

// Autenticación real mínima (Fase 4A): Bearer token JWT HS256 verificado por
// GuardAutenticacion. Ver docs/arquitectura/decisiones/0005-autenticacion-real-minima.md.
async function bootstrap(): Promise<void> {
  const configuracion = validarConfiguracionArranque();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.useBodyParser('json', {
    limit: configuracion.ingesta.limiteCuerpoJson,
  });
  app.useBodyParser('urlencoded', {
    extended: true,
    limit: configuracion.ingesta.limiteCuerpoJson,
  });
  app.enableShutdownHooks();
  await app.listen(configuracion.puerto);
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Fallo el arranque de la aplicación:', error);
  process.exitCode = 1;
});
