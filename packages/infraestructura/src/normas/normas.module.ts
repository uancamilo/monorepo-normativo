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
  UnidadDeTrabajoPublicacionNorma,
} from '@normativo/aplicacion';
import { NormasController } from './normas.controller';
import { RepositorioUsuariosEnMemoria } from '../memoria/RepositorioUsuariosEnMemoria';
import { RepositorioNormasEnMemoria } from '../memoria/RepositorioNormasEnMemoria';
import { RepositorioSuscripcionesEnMemoria } from '../memoria/RepositorioSuscripcionesEnMemoria';
import { GeneradorIdsSecuencial } from '../memoria/GeneradorIdsSecuencial';
import { PublicadorEventosNormasEnMemoria } from '../memoria/PublicadorEventosNormasEnMemoria';
import { UnidadDeTrabajoPublicacionNormaEnMemoria } from '../memoria/UnidadDeTrabajoPublicacionNormaEnMemoria';
import {
  TOKEN_GENERADOR_IDS,
  TOKEN_PUBLICADOR_EVENTOS,
  TOKEN_REPOSITORIO_NORMAS,
  TOKEN_REPOSITORIO_SUSCRIPCIONES,
  TOKEN_REPOSITORIO_USUARIOS,
  TOKEN_UNIDAD_TRABAJO_PUBLICACION_NORMA,
} from './tokens';

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
    {
      provide: TOKEN_UNIDAD_TRABAJO_PUBLICACION_NORMA,
      useFactory: (
        repositorioNormas: RepositorioNormas,
        publicadorEventosNormas: PublicadorEventosNormas,
      ) =>
        new UnidadDeTrabajoPublicacionNormaEnMemoria(
          repositorioNormas,
          publicadorEventosNormas,
        ),
      inject: [TOKEN_REPOSITORIO_NORMAS, TOKEN_PUBLICADOR_EVENTOS],
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
})
export class NormasModule {}
