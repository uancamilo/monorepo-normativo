import { Module } from '@nestjs/common';
import {
  ActualizarFuenteEdicionRegistroOficial,
  ActualizarNorma,
  CambiarEdicionNorma,
  ConsultorCambiosEdicionRegistroOficial,
  ConsultarContenidoNorma,
  ConsultarDetalleEdicionRegistroOficial,
  ConsultarEdicionesRegistroOficial,
  ConsultarNorma,
  ConsultarNormas,
  CrearEdicionRegistroOficial,
  GeneradorIds,
  PublicadorEventosNormas,
  PublicarNorma,
  PublicarNormas,
  RegistrarNorma,
  RepositorioEdicionesRegistroOficial,
  RepositorioIngestaRegistroOficial,
  RepositorioNormas,
  RepositorioSuscripciones,
  RepositorioUsuarios,
  ResolverFuenteRegistroOficial,
  UnidadDeTrabajoPublicacionNorma,
} from '@normativo/aplicacion';
import { NormasController } from './normas.controller';
import { EdicionesRegistroOficialController } from './ediciones-registro-oficial.controller';
import { AutenticacionModule } from '../autenticacion/autenticacion.module';
import { RepositorioUsuariosEnMemoria } from '../memoria/RepositorioUsuariosEnMemoria';
import { RepositorioNormasEnMemoria } from '../memoria/RepositorioNormasEnMemoria';
import { RepositorioSuscripcionesEnMemoria } from '../memoria/RepositorioSuscripcionesEnMemoria';
import { RepositorioEdicionesRegistroOficialEnMemoria } from '../memoria/RepositorioEdicionesRegistroOficialEnMemoria';
import { RepositorioIngestaRegistroOficialEnMemoria } from '../memoria/RepositorioIngestaRegistroOficialEnMemoria';
import { GeneradorIdsSecuencial } from '../memoria/GeneradorIdsSecuencial';
import { PublicadorEventosNormasEnMemoria } from '../memoria/PublicadorEventosNormasEnMemoria';
import { UnidadDeTrabajoPublicacionNormaEnMemoria } from '../memoria/UnidadDeTrabajoPublicacionNormaEnMemoria';
import {
  TOKEN_GENERADOR_IDS,
  TOKEN_CONSULTOR_CAMBIOS_EDICION_REGISTRO_OFICIAL,
  TOKEN_PUBLICADOR_EVENTOS,
  TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
  TOKEN_REPOSITORIO_NORMAS,
  TOKEN_REPOSITORIO_SUSCRIPCIONES,
  TOKEN_REPOSITORIO_USUARIOS,
  TOKEN_UNIDAD_TRABAJO_PUBLICACION_NORMA,
} from './tokens';
import { TOKEN_REPOSITORIO_INGESTA_REGISTRO_OFICIAL } from '../ingesta/tokens';

@Module({
  imports: [AutenticacionModule],
  controllers: [NormasController, EdicionesRegistroOficialController],
  providers: [
    // Adaptadores en memoria detrás de los puertos de aplicación.
    { provide: TOKEN_REPOSITORIO_USUARIOS, useClass: RepositorioUsuariosEnMemoria },
    { provide: TOKEN_REPOSITORIO_NORMAS, useClass: RepositorioNormasEnMemoria },
    {
      provide: TOKEN_CONSULTOR_CAMBIOS_EDICION_REGISTRO_OFICIAL,
      useExisting: TOKEN_REPOSITORIO_NORMAS,
    },
    {
      provide: TOKEN_REPOSITORIO_SUSCRIPCIONES,
      useClass: RepositorioSuscripcionesEnMemoria,
    },
    {
      provide: TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
      useClass: RepositorioEdicionesRegistroOficialEnMemoria,
    },
    { provide: TOKEN_GENERADOR_IDS, useClass: GeneradorIdsSecuencial },
    { provide: TOKEN_PUBLICADOR_EVENTOS, useClass: PublicadorEventosNormasEnMemoria },
    // El repositorio de ingesta vive aquí (no en IngestaModule) porque el
    // detalle editorial de norma necesita el origen Registro Oficial y la
    // instancia debe ser la misma que usa la ingesta. Comparte normas y
    // ediciones para que lo creado por ingesta sea visible en esos flujos.
    {
      provide: TOKEN_REPOSITORIO_INGESTA_REGISTRO_OFICIAL,
      useFactory: (
        repositorioNormas: RepositorioNormas,
        repositorioEdiciones: RepositorioEdicionesRegistroOficial,
      ) =>
        new RepositorioIngestaRegistroOficialEnMemoria(
          repositorioNormas,
          repositorioEdiciones,
        ),
      inject: [
        TOKEN_REPOSITORIO_NORMAS,
        TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
      ],
    },
    {
      provide: TOKEN_UNIDAD_TRABAJO_PUBLICACION_NORMA,
      useFactory: (
        repositorioNormas: RepositorioNormas,
        repositorioEdiciones: RepositorioEdicionesRegistroOficial,
        publicadorEventosNormas: PublicadorEventosNormas,
      ) =>
        new UnidadDeTrabajoPublicacionNormaEnMemoria(
          repositorioNormas,
          repositorioEdiciones,
          publicadorEventosNormas,
        ),
      inject: [
        TOKEN_REPOSITORIO_NORMAS,
        TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
        TOKEN_PUBLICADOR_EVENTOS,
      ],
    },

    // Casos de uso de aplicación, compuestos sobre los puertos.
    {
      provide: RegistrarNorma,
      useFactory: (
        repositorioUsuarios: RepositorioUsuarios,
        repositorioNormas: RepositorioNormas,
        repositorioEdiciones: RepositorioEdicionesRegistroOficial,
        generadorIds: GeneradorIds,
      ) =>
        new RegistrarNorma({
          repositorioUsuarios,
          repositorioNormas,
          repositorioEdiciones,
          generadorIds,
        }),
      inject: [
        TOKEN_REPOSITORIO_USUARIOS,
        TOKEN_REPOSITORIO_NORMAS,
        TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
        TOKEN_GENERADOR_IDS,
      ],
    },
    {
      provide: PublicarNorma,
      useFactory: (
        repositorioUsuarios: RepositorioUsuarios,
        repositorioNormas: RepositorioNormas,
        repositorioEdiciones: RepositorioEdicionesRegistroOficial,
        unidadDeTrabajoPublicacionNorma: UnidadDeTrabajoPublicacionNorma,
      ) =>
        new PublicarNorma({
          repositorioUsuarios,
          repositorioNormas,
          repositorioEdiciones,
          unidadDeTrabajoPublicacionNorma,
        }),
      inject: [
        TOKEN_REPOSITORIO_USUARIOS,
        TOKEN_REPOSITORIO_NORMAS,
        TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
        TOKEN_UNIDAD_TRABAJO_PUBLICACION_NORMA,
      ],
    },
    {
      provide: PublicarNormas,
      useFactory: (
        repositorioUsuarios: RepositorioUsuarios,
        repositorioNormas: RepositorioNormas,
        repositorioEdiciones: RepositorioEdicionesRegistroOficial,
        unidadDeTrabajoPublicacionNorma: UnidadDeTrabajoPublicacionNorma,
      ) =>
        new PublicarNormas({
          repositorioUsuarios,
          repositorioNormas,
          repositorioEdiciones,
          unidadDeTrabajoPublicacionNorma,
        }),
      inject: [
        TOKEN_REPOSITORIO_USUARIOS,
        TOKEN_REPOSITORIO_NORMAS,
        TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
        TOKEN_UNIDAD_TRABAJO_PUBLICACION_NORMA,
      ],
    },
    {
      provide: ConsultarNormas,
      useFactory: (
        repositorioUsuarios: RepositorioUsuarios,
        repositorioNormas: RepositorioNormas,
        repositorioEdiciones: RepositorioEdicionesRegistroOficial,
        repositorioIngesta: RepositorioIngestaRegistroOficial,
        consultorCambiosEdicion: ConsultorCambiosEdicionRegistroOficial,
      ) =>
        new ConsultarNormas({
          repositorioUsuarios,
          repositorioNormas,
          repositorioEdiciones,
          consultorOrigenRegistroOficial: repositorioIngesta,
          consultorCambiosEdicion,
        }),
      inject: [
        TOKEN_REPOSITORIO_USUARIOS,
        TOKEN_REPOSITORIO_NORMAS,
        TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
        TOKEN_REPOSITORIO_INGESTA_REGISTRO_OFICIAL,
        TOKEN_CONSULTOR_CAMBIOS_EDICION_REGISTRO_OFICIAL,
      ],
    },
    {
      provide: ConsultarNorma,
      useFactory: (
        repositorioUsuarios: RepositorioUsuarios,
        repositorioNormas: RepositorioNormas,
        repositorioEdiciones: RepositorioEdicionesRegistroOficial,
        repositorioIngesta: RepositorioIngestaRegistroOficial,
        consultorCambiosEdicion: ConsultorCambiosEdicionRegistroOficial,
      ) =>
        new ConsultarNorma({
          repositorioUsuarios,
          repositorioNormas,
          repositorioEdiciones,
          consultorOrigenRegistroOficial: repositorioIngesta,
          consultorCambiosEdicion,
        }),
      inject: [
        TOKEN_REPOSITORIO_USUARIOS,
        TOKEN_REPOSITORIO_NORMAS,
        TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
        TOKEN_REPOSITORIO_INGESTA_REGISTRO_OFICIAL,
        TOKEN_CONSULTOR_CAMBIOS_EDICION_REGISTRO_OFICIAL,
      ],
    },
    {
      provide: ActualizarNorma,
      useFactory: (
        repositorioUsuarios: RepositorioUsuarios,
        repositorioNormas: RepositorioNormas,
        repositorioEdiciones: RepositorioEdicionesRegistroOficial,
        consultorCambiosEdicion: ConsultorCambiosEdicionRegistroOficial,
        repositorioIngesta: RepositorioIngestaRegistroOficial,
      ) =>
        new ActualizarNorma({
          repositorioUsuarios,
          repositorioNormas,
          repositorioEdiciones,
          consultorCambiosEdicion,
          consultorOrigenRegistroOficial: repositorioIngesta,
        }),
      inject: [
        TOKEN_REPOSITORIO_USUARIOS,
        TOKEN_REPOSITORIO_NORMAS,
        TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
        TOKEN_CONSULTOR_CAMBIOS_EDICION_REGISTRO_OFICIAL,
        TOKEN_REPOSITORIO_INGESTA_REGISTRO_OFICIAL,
      ],
    },
    {
      provide: ActualizarFuenteEdicionRegistroOficial,
      useFactory: (
        repositorioUsuarios: RepositorioUsuarios,
        repositorioEdiciones: RepositorioEdicionesRegistroOficial,
      ) =>
        new ActualizarFuenteEdicionRegistroOficial({
          repositorioUsuarios,
          repositorioEdiciones,
        }),
      inject: [
        TOKEN_REPOSITORIO_USUARIOS,
        TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
      ],
    },
    {
      provide: ConsultarContenidoNorma,
      useFactory: (
        repositorioUsuarios: RepositorioUsuarios,
        repositorioNormas: RepositorioNormas,
        repositorioSuscripciones: RepositorioSuscripciones,
        repositorioEdiciones: RepositorioEdicionesRegistroOficial,
        consultorCambiosEdicion: ConsultorCambiosEdicionRegistroOficial,
      ) =>
        new ConsultarContenidoNorma({
          repositorioUsuarios,
          repositorioNormas,
          repositorioSuscripciones,
          repositorioEdiciones,
          consultorCambiosEdicion,
        }),
      inject: [
        TOKEN_REPOSITORIO_USUARIOS,
        TOKEN_REPOSITORIO_NORMAS,
        TOKEN_REPOSITORIO_SUSCRIPCIONES,
        TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
        TOKEN_CONSULTOR_CAMBIOS_EDICION_REGISTRO_OFICIAL,
      ],
    },
    {
      provide: CambiarEdicionNorma,
      useFactory: (
        repositorioUsuarios: RepositorioUsuarios,
        repositorioNormas: RepositorioNormas,
        repositorioEdiciones: RepositorioEdicionesRegistroOficial,
        repositorioIngesta: RepositorioIngestaRegistroOficial,
      ) =>
        new CambiarEdicionNorma({
          repositorioUsuarios,
          repositorioNormas,
          repositorioEdiciones,
          consultorOrigenRegistroOficial: repositorioIngesta,
        }),
      inject: [
        TOKEN_REPOSITORIO_USUARIOS,
        TOKEN_REPOSITORIO_NORMAS,
        TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
        TOKEN_REPOSITORIO_INGESTA_REGISTRO_OFICIAL,
      ],
    },
    {
      provide: CrearEdicionRegistroOficial,
      useFactory: (
        repositorioUsuarios: RepositorioUsuarios,
        repositorioEdiciones: RepositorioEdicionesRegistroOficial,
        generadorIds: GeneradorIds,
      ) =>
        new CrearEdicionRegistroOficial({
          repositorioUsuarios,
          repositorioEdiciones,
          generadorIds,
        }),
      inject: [
        TOKEN_REPOSITORIO_USUARIOS,
        TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
        TOKEN_GENERADOR_IDS,
      ],
    },
    {
      provide: ConsultarEdicionesRegistroOficial,
      useFactory: (
        repositorioUsuarios: RepositorioUsuarios,
        repositorioEdiciones: RepositorioEdicionesRegistroOficial,
      ) =>
        new ConsultarEdicionesRegistroOficial({
          repositorioUsuarios,
          repositorioEdiciones,
        }),
      inject: [
        TOKEN_REPOSITORIO_USUARIOS,
        TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
      ],
    },
    {
      provide: ConsultarDetalleEdicionRegistroOficial,
      useFactory: (
        repositorioUsuarios: RepositorioUsuarios,
        repositorioEdiciones: RepositorioEdicionesRegistroOficial,
      ) =>
        new ConsultarDetalleEdicionRegistroOficial({
          repositorioUsuarios,
          repositorioEdiciones,
        }),
      inject: [
        TOKEN_REPOSITORIO_USUARIOS,
        TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
      ],
    },
    {
      provide: ResolverFuenteRegistroOficial,
      useFactory: (
        repositorioUsuarios: RepositorioUsuarios,
        repositorioEdiciones: RepositorioEdicionesRegistroOficial,
      ) =>
        new ResolverFuenteRegistroOficial({
          repositorioUsuarios,
          repositorioEdiciones,
        }),
      inject: [
        TOKEN_REPOSITORIO_USUARIOS,
        TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
      ],
    },
  ],
  // Compartidos con la gestión mínima de usuarios (Fase 4G) y la ingesta del
  // Registro Oficial (Fase 5A): mismas instancias de usuarios, normas,
  // ediciones, ingesta y generador de ids para que lo creado en runtime sea
  // visible entre módulos.
  exports: [
    TOKEN_REPOSITORIO_USUARIOS,
    TOKEN_REPOSITORIO_NORMAS,
    TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
    TOKEN_REPOSITORIO_INGESTA_REGISTRO_OFICIAL,
    TOKEN_GENERADOR_IDS,
  ],
})
export class NormasModule {}
