import { Module } from '@nestjs/common';
import {
  ConsultarContenidoNorma,
  GeneradorIds,
  PublicarNorma,
  RegistrarNorma,
  RepositorioNormas,
  RepositorioSuscripciones,
  RepositorioUsuarios,
  UnidadDeTrabajoPublicacionNorma,
} from '@normativo/aplicacion';
import { NormasController } from './normas.controller';
import { AutenticacionModule } from '../autenticacion/autenticacion.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { RepositorioUsuariosPrisma } from '../persistencia/RepositorioUsuariosPrisma';
import { RepositorioNormasPrisma } from '../persistencia/RepositorioNormasPrisma';
import { RepositorioSuscripcionesPrisma } from '../persistencia/RepositorioSuscripcionesPrisma';
import { GeneradorIdsUuid } from '../persistencia/GeneradorIdsUuid';
import { UnidadDeTrabajoPublicacionNormaPrisma } from '../persistencia/UnidadDeTrabajoPublicacionNormaPrisma';
import {
  TOKEN_GENERADOR_IDS,
  TOKEN_REPOSITORIO_NORMAS,
  TOKEN_REPOSITORIO_SUSCRIPCIONES,
  TOKEN_REPOSITORIO_USUARIOS,
  TOKEN_UNIDAD_TRABAJO_PUBLICACION_NORMA,
} from './tokens';

@Module({
  imports: [AutenticacionModule, PrismaModule],
  controllers: [NormasController],
  providers: [
    // Adaptadores Prisma detrás de los puertos de aplicación.
    { provide: TOKEN_REPOSITORIO_USUARIOS, useClass: RepositorioUsuariosPrisma },
    { provide: TOKEN_REPOSITORIO_NORMAS, useClass: RepositorioNormasPrisma },
    {
      provide: TOKEN_REPOSITORIO_SUSCRIPCIONES,
      useClass: RepositorioSuscripcionesPrisma,
    },
    { provide: TOKEN_GENERADOR_IDS, useClass: GeneradorIdsUuid },
    {
      provide: TOKEN_UNIDAD_TRABAJO_PUBLICACION_NORMA,
      useFactory: (prisma: PrismaService) =>
        new UnidadDeTrabajoPublicacionNormaPrisma(prisma),
      inject: [PrismaService],
    },

    // Casos de uso de aplicación, compuestos sobre los puertos.
    {
      provide: RegistrarNorma,
      useFactory: (
        repositorioUsuarios: RepositorioUsuarios,
        repositorioNormas: RepositorioNormas,
        generadorIds: GeneradorIds,
      ) =>
        new RegistrarNorma({
          repositorioUsuarios,
          repositorioNormas,
          generadorIds,
        }),
      inject: [
        TOKEN_REPOSITORIO_USUARIOS,
        TOKEN_REPOSITORIO_NORMAS,
        TOKEN_GENERADOR_IDS,
      ],
    },
    {
      provide: PublicarNorma,
      useFactory: (
        repositorioUsuarios: RepositorioUsuarios,
        repositorioNormas: RepositorioNormas,
        unidadDeTrabajoPublicacionNorma: UnidadDeTrabajoPublicacionNorma,
      ) =>
        new PublicarNorma({
          repositorioUsuarios,
          repositorioNormas,
          unidadDeTrabajoPublicacionNorma,
        }),
      inject: [
        TOKEN_REPOSITORIO_USUARIOS,
        TOKEN_REPOSITORIO_NORMAS,
        TOKEN_UNIDAD_TRABAJO_PUBLICACION_NORMA,
      ],
    },
    {
      provide: ConsultarContenidoNorma,
      useFactory: (
        repositorioUsuarios: RepositorioUsuarios,
        repositorioNormas: RepositorioNormas,
        repositorioSuscripciones: RepositorioSuscripciones,
      ) =>
        new ConsultarContenidoNorma({
          repositorioUsuarios,
          repositorioNormas,
          repositorioSuscripciones,
        }),
      inject: [
        TOKEN_REPOSITORIO_USUARIOS,
        TOKEN_REPOSITORIO_NORMAS,
        TOKEN_REPOSITORIO_SUSCRIPCIONES,
      ],
    },
  ],
  // Compartidos con la gestión mínima de usuarios (Fase 4G).
  exports: [TOKEN_REPOSITORIO_USUARIOS, TOKEN_GENERADOR_IDS],
})
export class NormasPrismaModule {}
