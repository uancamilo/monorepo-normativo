import {
  EdicionRegistroOficial,
  EstadoResolucionFuente,
} from '@normativo/dominio';
import { RepositorioUsuarios } from '../../normas/puertos/RepositorioUsuarios';
import { RepositorioEdicionesRegistroOficial } from '../../normas/puertos/RepositorioEdicionesRegistroOficial';
import {
  CatalogoRegistroOficial,
  EdicionCatalogoRegistroOficial,
} from '../../normas/puertos/CatalogoRegistroOficial';
import { PoliticaIngestaRegistroOficial } from '../politicas/PoliticaIngestaRegistroOficial';

export type SolicitudResolverFuenteRegistroOficial = {
  usuarioAutenticadoId: string;
  /**
   * Ediciones concretas a resolver. Si se omite, se resuelven todas las
   * PENDIENTE.
   */
  edicionIds?: string[];
};

export type RazonResolverFuenteFallido =
  | 'SOLICITUD_INVALIDA'
  | 'ACCESO_DENEGADO'
  | 'CATALOGO_NO_DISPONIBLE';

export type ResultadoResolucionFuenteEdicion =
  | {
      edicionId: string;
      procesada: true;
      estadoResolucionFuente: EstadoResolucionFuente;
      urlPdf: string | null;
    }
  | {
      edicionId: string;
      procesada: false;
      razon: 'EDICION_NO_ENCONTRADA' | 'FUENTE_YA_ESTABLECIDA';
    };

export type ResultadoResolverFuenteRegistroOficial =
  | {
      exitoso: true;
      resultados: ResultadoResolucionFuenteEdicion[];
    }
  | {
      exitoso: false;
      razon: RazonResolverFuenteFallido;
    };

export interface DependenciasResolverFuenteRegistroOficial {
  repositorioUsuarios: RepositorioUsuarios;
  repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  catalogoRegistroOficial?: CatalogoRegistroOficial;
  politicaIngesta?: PoliticaIngestaRegistroOficial;
}

/**
 * Resolución de la URL del PDF oficial (`resolucionFuenteRegistroOficial`).
 * Busca en el catálogo del Registro Oficial por tipo + número de publicación
 * y usa la fecha detectada como criterio de confianza:
 * - coincidencia única y confiable -> RESUELTA con urlPdf;
 * - cero coincidencias -> NO_ENCONTRADA sin urlPdf;
 * - múltiples URLs posibles o fecha discrepante -> CONFLICTIVA sin urlPdf
 *   (nunca se elige arbitrariamente ni se sobrescribe la fecha detectada).
 *
 * Es idempotente y por edición (una sola vez, no norma por norma): las
 * ediciones RESUELTA o MANUAL nunca se sobrescriben.
 */
export class ResolverFuenteRegistroOficial {
  private readonly repositorioUsuarios: RepositorioUsuarios;
  private readonly repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  private readonly catalogoRegistroOficial?: CatalogoRegistroOficial;
  private readonly politicaIngesta: PoliticaIngestaRegistroOficial;

  constructor(dependencias: DependenciasResolverFuenteRegistroOficial) {
    this.repositorioUsuarios = dependencias.repositorioUsuarios;
    this.repositorioEdiciones = dependencias.repositorioEdiciones;
    this.catalogoRegistroOficial = dependencias.catalogoRegistroOficial;
    this.politicaIngesta =
      dependencias.politicaIngesta ?? new PoliticaIngestaRegistroOficial();
  }

  async ejecutar(
    solicitud: SolicitudResolverFuenteRegistroOficial,
  ): Promise<ResultadoResolverFuenteRegistroOficial> {
    if (!esSolicitudValida(solicitud)) {
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }

    const actor = await this.repositorioUsuarios.buscarPorId(
      solicitud.usuarioAutenticadoId,
    );
    if (actor === null || !this.politicaIngesta.puedeResolverFuentes(actor)) {
      return { exitoso: false, razon: 'ACCESO_DENEGADO' };
    }

    // La ausencia de integración real no equivale a buscar y no encontrar.
    // Se detiene antes de leer o modificar ediciones para conservarlas
    // PENDIENTE hasta que exista un catálogo oficial configurado.
    if (this.catalogoRegistroOficial === undefined) {
      return { exitoso: false, razon: 'CATALOGO_NO_DISPONIBLE' };
    }
    const catalogoRegistroOficial = this.catalogoRegistroOficial;

    const resultados: ResultadoResolucionFuenteEdicion[] = [];

    if (solicitud.edicionIds !== undefined) {
      for (const edicionIdCrudo of solicitud.edicionIds) {
        const edicionId = edicionIdCrudo.trim();
        const edicion = await this.repositorioEdiciones.buscarPorId(edicionId);
        if (edicion === null) {
          resultados.push({
            edicionId,
            procesada: false,
            razon: 'EDICION_NO_ENCONTRADA',
          });
          continue;
        }
        resultados.push(
          await this.resolverEdicion(edicion, catalogoRegistroOficial),
        );
      }
      return { exitoso: true, resultados };
    }

    const pendientes =
      await this.repositorioEdiciones.listarPorEstadoResolucionFuente([
        EstadoResolucionFuente.PENDIENTE,
      ]);
    for (const edicion of pendientes) {
      resultados.push(
        await this.resolverEdicion(edicion, catalogoRegistroOficial),
      );
    }
    return { exitoso: true, resultados };
  }

  private async resolverEdicion(
    edicion: EdicionRegistroOficial,
    catalogoRegistroOficial: CatalogoRegistroOficial,
  ): Promise<ResultadoResolucionFuenteEdicion> {
    if (
      edicion.estadoResolucionFuente !== EstadoResolucionFuente.PENDIENTE ||
      edicion.urlPdf !== null
    ) {
      return {
        edicionId: edicion.id,
        procesada: false,
        razon: 'FUENTE_YA_ESTABLECIDA',
      };
    }

    const candidatas = await catalogoRegistroOficial.buscarEdiciones({
      tipoPublicacionRegistroOficial: edicion.tipoPublicacionRegistroOficial,
      numeroPublicacionRegistroOficial:
        edicion.numeroPublicacionRegistroOficial,
    });

    const resuelta = decidirResolucion(edicion, candidatas);
    const persistencia =
      await this.repositorioEdiciones.guardarResolucionSiPendiente(resuelta);
    if (!persistencia.actualizada) {
      return persistencia.edicionActual === null
        ? {
            edicionId: edicion.id,
            procesada: false,
            razon: 'EDICION_NO_ENCONTRADA',
          }
        : {
            edicionId: edicion.id,
            procesada: false,
            razon: 'FUENTE_YA_ESTABLECIDA',
          };
    }

    return {
      edicionId: resuelta.id,
      procesada: true,
      estadoResolucionFuente: resuelta.estadoResolucionFuente,
      urlPdf: resuelta.urlPdf,
    };
  }
}

/**
 * El catálogo se consulta por tipo + número; la fecha detectada verifica la
 * confianza de la coincidencia. Una discrepancia de fecha no sobrescribe lo
 * detectado: si genera ambigüedad, la edición queda CONFLICTIVA.
 */
function decidirResolucion(
  edicion: EdicionRegistroOficial,
  candidatas: EdicionCatalogoRegistroOficial[],
): EdicionRegistroOficial {
  const validas = deduplicarPorUrl(
    candidatas.filter((candidata) => esUrlValida(candidata.urlPdf)),
  );

  if (validas.length === 0) {
    return edicion.marcarFuenteNoEncontrada();
  }

  if (validas.length === 1) {
    const unica = validas[0];
    const fechaCompatible =
      unica.fechaPublicacionOficial === null ||
      esMismaFecha(unica.fechaPublicacionOficial, edicion.fechaPublicacionOficial);
    return fechaCompatible
      ? edicion.resolverFuente(unica.urlPdf)
      : edicion.marcarFuenteConflictiva();
  }

  const coincidentesPorFecha = validas.filter(
    (candidata) =>
      candidata.fechaPublicacionOficial !== null &&
      esMismaFecha(
        candidata.fechaPublicacionOficial,
        edicion.fechaPublicacionOficial,
      ),
  );
  if (coincidentesPorFecha.length === 1) {
    return edicion.resolverFuente(coincidentesPorFecha[0].urlPdf);
  }
  return edicion.marcarFuenteConflictiva();
}

function deduplicarPorUrl(
  candidatas: EdicionCatalogoRegistroOficial[],
): EdicionCatalogoRegistroOficial[] {
  const porUrl = new Map<string, EdicionCatalogoRegistroOficial>();
  for (const candidata of candidatas) {
    if (!porUrl.has(candidata.urlPdf)) {
      porUrl.set(candidata.urlPdf, candidata);
    }
  }
  return [...porUrl.values()];
}

function esMismaFecha(a: Date, b: Date): boolean {
  return (
    a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)
  );
}

function esSolicitudValida(
  solicitud: SolicitudResolverFuenteRegistroOficial,
): boolean {
  if (esTextoVacio(solicitud.usuarioAutenticadoId)) {
    return false;
  }
  if (solicitud.edicionIds === undefined) {
    return true;
  }
  return (
    Array.isArray(solicitud.edicionIds) &&
    solicitud.edicionIds.length > 0 &&
    solicitud.edicionIds.every((id) => !esTextoVacio(id))
  );
}

function esTextoVacio(valor: unknown): boolean {
  return typeof valor !== 'string' || valor.trim().length === 0;
}

function esUrlValida(valor: string): boolean {
  try {
    new URL(valor);
    return true;
  } catch {
    return false;
  }
}
