import {
  EdicionRegistroOficial,
  EstadoEditorialNorma,
  Norma,
  RazonPublicacionIncompleta,
} from '@normativo/dominio';
import { RepositorioNormas } from '../puertos/RepositorioNormas';
import { RepositorioUsuarios } from '../puertos/RepositorioUsuarios';
import { RepositorioEdicionesRegistroOficial } from '../puertos/RepositorioEdicionesRegistroOficial';
import { UnidadDeTrabajoPublicacionNorma } from '../puertos/UnidadDeTrabajoPublicacionNorma';
import { PoliticaGestionEditorialNorma } from '../politicas/PoliticaGestionEditorialNorma';

export type SolicitudPublicarNorma = {
  usuarioAutenticadoId: string;
  normaId: string;
  fechaPublicacionEnSistema?: Date;
};

/**
 * Razones de fuente: la publicación exige que la EdicionRegistroOficial
 * asociada tenga urlPdf válida con resolución RESUELTA o MANUAL.
 */
export type RazonFuentePublicacionInvalida = 'FUENTE_REQUERIDA';

export type RazonPublicarNormaFallido =
  | 'SOLICITUD_INVALIDA'
  | 'USUARIO_NO_ENCONTRADO'
  | 'NORMA_NO_ENCONTRADA'
  | 'ACCESO_DENEGADO'
  | 'NORMA_YA_PUBLICADA'
  | 'NORMA_MODIFICADA_CONCURRENTEMENTE'
  | RazonPublicacionIncompleta
  | RazonFuentePublicacionInvalida;

export type ResultadoPublicarNorma =
  | {
      exitoso: true;
      norma: {
        id: string;
        estadoEditorial: EstadoEditorialNorma.PUBLICADA;
        fechaPublicacionEnSistema: Date;
        tieneContenidoCompleto: boolean;
      };
    }
  | {
      exitoso: false;
      razon: RazonPublicarNormaFallido;
    };

export interface DependenciasPublicarNorma {
  repositorioUsuarios: RepositorioUsuarios;
  repositorioNormas: RepositorioNormas;
  repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  unidadDeTrabajoPublicacionNorma: UnidadDeTrabajoPublicacionNorma;
  politicaGestionEditorial?: PoliticaGestionEditorialNorma;
}

/**
 * Requisito de fuente para publicar: la norma debe tener edición asociada y
 * la edición debe tener urlPdf con resolución RESUELTA o MANUAL. PENDIENTE,
 * NO_ENCONTRADA y CONFLICTIVA bloquean la publicación.
 */
export function validarFuenteParaPublicacion(
  norma: Norma,
  edicion: EdicionRegistroOficial | null,
): RazonPublicacionIncompleta | RazonFuentePublicacionInvalida | null {
  if (norma.edicionRegistroOficialId === null || edicion === null) {
    return 'EDICION_REGISTRO_OFICIAL_REQUERIDA';
  }
  if (!edicion.tieneFuenteValidaParaPublicacion()) {
    return 'FUENTE_REQUERIDA';
  }
  return null;
}

export class PublicarNorma {
  private readonly repositorioUsuarios: RepositorioUsuarios;
  private readonly repositorioNormas: RepositorioNormas;
  private readonly repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  private readonly unidadDeTrabajoPublicacionNorma: UnidadDeTrabajoPublicacionNorma;
  private readonly politicaGestionEditorial: PoliticaGestionEditorialNorma;

  constructor(dependencias: DependenciasPublicarNorma) {
    this.repositorioUsuarios = dependencias.repositorioUsuarios;
    this.repositorioNormas = dependencias.repositorioNormas;
    this.repositorioEdiciones = dependencias.repositorioEdiciones;
    this.unidadDeTrabajoPublicacionNorma =
      dependencias.unidadDeTrabajoPublicacionNorma;
    this.politicaGestionEditorial =
      dependencias.politicaGestionEditorial ??
      new PoliticaGestionEditorialNorma();
  }

  async ejecutar(
    solicitud: SolicitudPublicarNorma,
  ): Promise<ResultadoPublicarNorma> {
    if (
      esTextoVacio(solicitud.usuarioAutenticadoId) ||
      esTextoVacio(solicitud.normaId)
    ) {
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }

    if (
      solicitud.fechaPublicacionEnSistema !== undefined &&
      !esFechaValida(solicitud.fechaPublicacionEnSistema)
    ) {
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }

    const usuario = await this.repositorioUsuarios.buscarPorId(
      solicitud.usuarioAutenticadoId,
    );
    if (usuario === null) {
      return { exitoso: false, razon: 'USUARIO_NO_ENCONTRADO' };
    }

    if (!this.politicaGestionEditorial.puedePublicarNormas(usuario)) {
      return { exitoso: false, razon: 'ACCESO_DENEGADO' };
    }

    const norma = await this.repositorioNormas.buscarPorId(solicitud.normaId);
    if (norma === null) {
      return { exitoso: false, razon: 'NORMA_NO_ENCONTRADA' };
    }

    if (norma.estaPublicada()) {
      return { exitoso: false, razon: 'NORMA_YA_PUBLICADA' };
    }

    // Obligatorios de publicación (regla del dominio): número, fecha de
    // expedición y contenido pueden estar vacíos; el resto de datos jurídicos
    // debe estar completo.
    const camposFaltantes = norma.camposFaltantesParaPublicar();
    if (camposFaltantes.length > 0) {
      return { exitoso: false, razon: camposFaltantes[0] };
    }

    const edicion =
      norma.edicionRegistroOficialId === null
        ? null
        : await this.repositorioEdiciones.buscarPorId(
            norma.edicionRegistroOficialId,
          );
    const razonFuente = validarFuenteParaPublicacion(norma, edicion);
    if (razonFuente !== null) {
      return { exitoso: false, razon: razonFuente };
    }

    const fechaPublicacionEnSistema =
      solicitud.fechaPublicacionEnSistema ?? new Date();
    const normaPublicada = norma.publicar(fechaPublicacionEnSistema);

    const tieneContenidoCompleto = normaPublicada.tieneContenidoCompleto();

    const resultadoPublicacion =
      await this.unidadDeTrabajoPublicacionNorma.guardarNormaPublicadaConEvento(
        normaPublicada,
        {
          normaId: normaPublicada.id,
          fechaPublicacionEnSistema,
          tieneContenidoCompleto,
        },
      );
    if (!resultadoPublicacion.publicada) {
      // Conflicto esperado, nunca un error de infraestructura: otra
      // publicación ganó la carrera o una modificación concurrente dejó la
      // norma sin precondiciones de publicación.
      return { exitoso: false, razon: resultadoPublicacion.razon };
    }

    return {
      exitoso: true,
      norma: {
        id: normaPublicada.id,
        estadoEditorial: EstadoEditorialNorma.PUBLICADA,
        fechaPublicacionEnSistema,
        tieneContenidoCompleto: resultadoPublicacion.tieneContenidoCompleto,
      },
    };
  }
}

function esTextoVacio(valor: string): boolean {
  return typeof valor !== 'string' || valor.trim().length === 0;
}

function esFechaValida(fecha: Date): boolean {
  return fecha instanceof Date && !Number.isNaN(fecha.getTime());
}
