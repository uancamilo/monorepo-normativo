import { Module } from '@nestjs/common';
import {
  ConsultarContenidoNorma,
  GeneradorIds,
  PublicadorEventosNormas,
  PublicarNorma,
  RegistrarNorma,
  RepositorioNormas,
  RepositorioSuscripciones,
  RepositorioUsuarios,
} from '@normativo/aplicacion';
import { NormasController } from './normas.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RepositorioUsuariosPrisma } from '../persistencia/RepositorioUsuariosPrisma';
import { RepositorioNormasPrisma } from '../persistencia/RepositorioNormasPrisma';
import { RepositorioSuscripcionesPrisma } from '../persistencia/RepositorioSuscripcionesPrisma';
import { GeneradorIdsUuid } from '../persistencia/GeneradorIdsUuid';
import { PublicadorEventosNormasPrisma } from '../persistencia/PublicadorEventosNormasPrisma';
import {
  TOKEN_GENERADOR_IDS,
  TOKEN_PUBLICADOR_EVENTOS,
  TOKEN_REPOSITORIO_NORMAS,
  TOKEN_REPOSITORIO_SUSCRIPCIONES,
  TOKEN_REPOSITORIO_USUARIOS,
} from './normas.module';

@Module({
  imports: [PrismaModule],
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
    { provide: TOKEN_PUBLICADOR_EVENTOS, useClass: PublicadorEventosNormasPrisma },

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
        publicadorEventosNormas: PublicadorEventosNormas,
      ) =>
        new PublicarNorma({
          repositorioUsuarios,
          repositorioNormas,
          publicadorEventosNormas,
        }),
      inject: [
        TOKEN_REPOSITORIO_USUARIOS,
        TOKEN_REPOSITORIO_NORMAS,
        TOKEN_PUBLICADOR_EVENTOS,
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
})
export class NormasPrismaModule {}
