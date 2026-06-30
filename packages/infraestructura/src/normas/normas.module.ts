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
import { RepositorioUsuariosEnMemoria } from '../memoria/RepositorioUsuariosEnMemoria';
import { RepositorioNormasEnMemoria } from '../memoria/RepositorioNormasEnMemoria';
import { RepositorioSuscripcionesEnMemoria } from '../memoria/RepositorioSuscripcionesEnMemoria';
import { GeneradorIdsSecuencial } from '../memoria/GeneradorIdsSecuencial';
import { PublicadorEventosNormasEnMemoria } from '../memoria/PublicadorEventosNormasEnMemoria';

// Tokens de inyección de los puertos de aplicación.
export const TOKEN_REPOSITORIO_USUARIOS = 'RepositorioUsuarios';
export const TOKEN_REPOSITORIO_NORMAS = 'RepositorioNormas';
export const TOKEN_REPOSITORIO_SUSCRIPCIONES = 'RepositorioSuscripciones';
export const TOKEN_GENERADOR_IDS = 'GeneradorIds';
export const TOKEN_PUBLICADOR_EVENTOS = 'PublicadorEventosNormas';

@Module({
  controllers: [NormasController],
  providers: [
    // Adaptadores en memoria detrás de los puertos de aplicación.
    { provide: TOKEN_REPOSITORIO_USUARIOS, useClass: RepositorioUsuariosEnMemoria },
    { provide: TOKEN_REPOSITORIO_NORMAS, useClass: RepositorioNormasEnMemoria },
    {
      provide: TOKEN_REPOSITORIO_SUSCRIPCIONES,
      useClass: RepositorioSuscripcionesEnMemoria,
    },
    { provide: TOKEN_GENERADOR_IDS, useClass: GeneradorIdsSecuencial },
    { provide: TOKEN_PUBLICADOR_EVENTOS, useClass: PublicadorEventosNormasEnMemoria },

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
export class NormasModule {}
