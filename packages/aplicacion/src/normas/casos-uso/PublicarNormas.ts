import {
  EstadoEditorialNorma,
  RazonPublicacionIncompleta,
} from '@normativo/dominio';
import { RepositorioNormas } from '../puertos/RepositorioNormas';
import { RepositorioUsuarios } from '../puertos/RepositorioUsuarios';
import { RepositorioEdicionesRegistroOficial } from '../puertos/RepositorioEdicionesRegistroOficial';
import { UnidadDeTrabajoPublicacionNorma } from '../puertos/UnidadDeTrabajoPublicacionNorma';
import { PoliticaGestionEditorialNorma } from '../politicas/PoliticaGestionEditorialNorma';
import {
  RazonFuentePublicacionInvalida,
  validarFuenteParaPublicacion,
} from './PublicarNorma';

export const LIMITE_MAXIMO_NORMAS_POR_PUBLICACION = 100;

export type SolicitudPublicarNormas = {
  usuarioAutenticadoId: string;
  normaIds: string[];
  fechaPublicacionEnSistema?: Date;
};

export type RazonPublicarNormasFallido =
  | 'SOLICITUD_INVALIDA'
  | 'USUARIO_NO_ENCONTRADO'
  | 'ACCESO_DENEGADO';

export type RazonNormaNoPublicadaEnLote =
  | 'NORMA_NO_ENCONTRADA'
  | 'NORMA_YA_PUBLICADA'
  | 'NORMA_MODIFICADA_CONCURRENTEMENTE'
  | RazonPublicacionIncompleta
  | RazonFuentePublicacionInvalida;

export type ResultadoPublicacionNormaEnLote =
  | {
      normaId: string;
      publicada: true;
      estadoEditorial: EstadoEditorialNorma.PUBLICADA;
    }
  | {
      normaId: string;
      publicada: false;
      razon: RazonNormaNoPublicadaEnLote;
    };

export type ResultadoPublicarNormas =
  | {
      exitoso: true;
      resultados: ResultadoPublicacionNormaEnLote[];
    }
  | {
      exitoso: false;
      razon: RazonPublicarNormasFallido;
    };

export interface DependenciasPublicarNormas {
  repositorioUsuarios: RepositorioUsuarios;
  repositorioNormas: RepositorioNormas;
  repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  unidadDeTrabajoPublicacionNorma: UnidadDeTrabajoPublicacionNorma;
  politicaGestionEditorial?: PoliticaGestionEditorialNorma;
}

/**
 * Publicación múltiple con semántica parcial: una norma inválida no bloquea
 * a las demás; el resultado se reporta por norma. Aplica las mismas reglas de
 * publicación que el flujo individual (mismos obligatorios; número, fecha de
 * expedición y contenido pueden estar vacíos; la edición asociada debe tener
 * fuente RESUELTA o MANUAL).
 */
export class PublicarNormas {
  private readonly repositorioUsuarios: RepositorioUsuarios;
  private readonly repositorioNormas: RepositorioNormas;
  private readonly repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  private readonly unidadDeTrabajoPublicacionNorma: UnidadDeTrabajoPublicacionNorma;
  private readonly politicaGestionEditorial: PoliticaGestionEditorialNorma;

  constructor(dependencias: DependenciasPublicarNormas) {
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
    solicitud: SolicitudPublicarNormas,
  ): Promise<ResultadoPublicarNormas> {
    if (!esSolicitudValida(solicitud)) {
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

    const fechaPublicacionEnSistema =
      solicitud.fechaPublicacionEnSistema ?? new Date();

    const resultados: ResultadoPublicacionNormaEnLote[] = [];
    for (const normaIdCrudo of solicitud.normaIds) {
      const normaId = normaIdCrudo.trim();
      resultados.push(await this.publicarUna(normaId, fechaPublicacionEnSistema));
    }

    return { exitoso: true, resultados };
  }

  private async publicarUna(
    normaId: string,
    fechaPublicacionEnSistema: Date,
  ): Promise<ResultadoPublicacionNormaEnLote> {
    const norma = await this.repositorioNormas.buscarPorId(normaId);
    if (norma === null) {
      return { normaId, publicada: false, razon: 'NORMA_NO_ENCONTRADA' };
    }

    if (norma.estaPublicada()) {
      return { normaId, publicada: false, razon: 'NORMA_YA_PUBLICADA' };
    }

    const camposFaltantes = norma.camposFaltantesParaPublicar();
    if (camposFaltantes.length > 0) {
      return { normaId, publicada: false, razon: camposFaltantes[0] };
    }

    const edicion =
      norma.edicionRegistroOficialId === null
        ? null
        : await this.repositorioEdiciones.buscarPorId(
            norma.edicionRegistroOficialId,
          );
    const razonFuente = validarFuenteParaPublicacion(norma, edicion);
    if (razonFuente !== null) {
      return { normaId, publicada: false, razon: razonFuente };
    }

    const normaPublicada = norma.publicar(fechaPublicacionEnSistema);
    const resultadoPublicacion =
      await this.unidadDeTrabajoPublicacionNorma.guardarNormaPublicadaConEvento(
        normaPublicada,
        {
          normaId: normaPublicada.id,
          fechaPublicacionEnSistema,
          tieneContenidoCompleto: normaPublicada.tieneContenidoCompleto(),
        },
      );
    if (!resultadoPublicacion.publicada) {
      // Conflicto concurrente esperado (carrera perdida o precondiciones
      // invalidadas): se reporta por norma y el lote continúa; solo los
      // fallos desconocidos de infraestructura se propagan.
      return { normaId, publicada: false, razon: resultadoPublicacion.razon };
    }

    return {
      normaId,
      publicada: true,
      estadoEditorial: EstadoEditorialNorma.PUBLICADA,
    };
  }
}

function esSolicitudValida(solicitud: SolicitudPublicarNormas): boolean {
  if (esTextoVacio(solicitud.usuarioAutenticadoId)) {
    return false;
  }
  if (
    solicitud.fechaPublicacionEnSistema !== undefined &&
    !esFechaValida(solicitud.fechaPublicacionEnSistema)
  ) {
    return false;
  }
  if (
    !Array.isArray(solicitud.normaIds) ||
    solicitud.normaIds.length === 0 ||
    solicitud.normaIds.length > LIMITE_MAXIMO_NORMAS_POR_PUBLICACION
  ) {
    return false;
  }
  const vistos = new Set<string>();
  for (const normaId of solicitud.normaIds) {
    if (esTextoVacio(normaId)) {
      return false;
    }
    const normalizado = normaId.trim();
    if (vistos.has(normalizado)) {
      return false;
    }
    vistos.add(normalizado);
  }
  return true;
}

function esTextoVacio(valor: unknown): boolean {
  return typeof valor !== 'string' || valor.trim().length === 0;
}

function esFechaValida(fecha: Date): boolean {
  return fecha instanceof Date && !Number.isNaN(fecha.getTime());
}
