import {
  EdicionRegistroOficial,
  EstadoResolucionFuente,
} from '@normativo/dominio';
import { RepositorioUsuarios } from '../../normas/puertos/RepositorioUsuarios';
import { RepositorioEdicionesRegistroOficial } from '../../normas/puertos/RepositorioEdicionesRegistroOficial';
import {
  CatalogoRegistroOficial,
  EdicionCatalogoRegistroOficial,
  RazonConsultaCatalogoFallida,
} from '../../normas/puertos/CatalogoRegistroOficial';
import { PoliticaIngestaRegistroOficial } from '../politicas/PoliticaIngestaRegistroOficial';

/**
 * Tope operativo por ejecución: el catálogo oficial es un servicio externo y
 * puede haber miles de pendientes; una sola llamada HTTP no debe procesarlas
 * todas. Configurable en infraestructura.
 */
export const LIMITE_PREDETERMINADO_EDICIONES_RESOLUCION = 50;

/**
 * Paralelismo interno por defecto al consultar el catálogo. Acota la presión
 * sobre el sitio oficial sin serializar por completo. Configurable.
 */
export const CONCURRENCIA_PREDETERMINADA_RESOLUCION = 4;

export type SolicitudResolverFuenteRegistroOficial = {
  usuarioAutenticadoId: string;
  /**
   * Ediciones concretas a resolver. Si se omite, se resuelve un lote acotado
   * de PENDIENTE sin `urlPdf`, en orden determinista. Mutuamente excluyente
   * con `limite`.
   */
  edicionIds?: string[];
  /**
   * Tope opcional del lote de pendientes a procesar. Nunca supera el máximo
   * seguro configurado (se toma el menor de ambos). Mutuamente excluyente con
   * `edicionIds`: enviar ambos es SOLICITUD_INVALIDA.
   */
  limite?: number;
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
      razon:
        | 'EDICION_NO_ENCONTRADA'
        | 'FUENTE_YA_ESTABLECIDA'
        /**
         * El catálogo falló (no todos los fallos son transitorios): la razón
         * exacta del puerto se conserva, la edición NO se modifica y NO se
         * confunde con NO_ENCONTRADA.
         */
        | RazonConsultaCatalogoFallida;
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
  /** Máximo seguro de ediciones por ejecución. Default 50. */
  limiteMaximoEdiciones?: number;
  /** Paralelismo interno al consultar el catálogo. Default 4. */
  maxConcurrencia?: number;
}

/**
 * Resolución de la URL del PDF oficial (`resolucionFuenteRegistroOficial`).
 * Busca en el catálogo del Registro Oficial por tipo + número + fecha y usa la
 * fecha detectada como criterio de confianza al desempatar:
 * - coincidencia única y confiable -> RESUELTA con urlPdf;
 * - cero coincidencias tras consulta exitosa -> NO_ENCONTRADA sin urlPdf;
 * - múltiples URLs posibles o fecha discrepante -> CONFLICTIVA sin urlPdf
 *   (nunca se elige arbitrariamente ni se sobrescribe la fecha detectada);
 * - fallo del catálogo -> la edición no se toca y se conserva la razón exacta
 *   del puerto (transitoria, estructural, de cobertura o de búsqueda incompleta).
 *
 * Es idempotente y por edición (una sola vez, no norma por norma): procesa
 * exclusivamente ediciones PENDIENTE sin URL — los estados terminales
 * (RESUELTA, MANUAL, NO_ENCONTRADA, CONFLICTIVA) se omiten sin consultar el
 * catálogo — y la persistencia usa compare-and-set (solo escribe si sigue
 * PENDIENTE y sin URL).
 */
export class ResolverFuenteRegistroOficial {
  private readonly repositorioUsuarios: RepositorioUsuarios;
  private readonly repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  private readonly catalogoRegistroOficial?: CatalogoRegistroOficial;
  private readonly politicaIngesta: PoliticaIngestaRegistroOficial;
  private readonly limiteMaximoEdiciones: number;
  private readonly maxConcurrencia: number;

  constructor(dependencias: DependenciasResolverFuenteRegistroOficial) {
    this.repositorioUsuarios = dependencias.repositorioUsuarios;
    this.repositorioEdiciones = dependencias.repositorioEdiciones;
    this.catalogoRegistroOficial = dependencias.catalogoRegistroOficial;
    this.politicaIngesta =
      dependencias.politicaIngesta ?? new PoliticaIngestaRegistroOficial();
    this.limiteMaximoEdiciones = normalizarLimite(
      dependencias.limiteMaximoEdiciones,
      LIMITE_PREDETERMINADO_EDICIONES_RESOLUCION,
    );
    this.maxConcurrencia = normalizarLimite(
      dependencias.maxConcurrencia,
      CONCURRENCIA_PREDETERMINADA_RESOLUCION,
    );
  }

  async ejecutar(
    solicitud: SolicitudResolverFuenteRegistroOficial,
  ): Promise<ResultadoResolverFuenteRegistroOficial> {
    if (!this.esSolicitudValida(solicitud)) {
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
    const catalogo = this.catalogoRegistroOficial;

    if (solicitud.edicionIds !== undefined) {
      const ids = solicitud.edicionIds.map((id) => id.trim());
      const resultados = await this.procesarEnLote(ids, (edicionId) =>
        this.resolverPorId(edicionId, catalogo),
      );
      return { exitoso: true, resultados };
    }

    const limiteLote = solicitud.limite
      ? Math.min(solicitud.limite, this.limiteMaximoEdiciones)
      : this.limiteMaximoEdiciones;
    const pendientes =
      await this.repositorioEdiciones.listarPendientesSinFuente(limiteLote);
    const resultados = await this.procesarEnLote(pendientes, (edicion) =>
      this.resolverEdicion(edicion, catalogo),
    );
    return { exitoso: true, resultados };
  }

  private async resolverPorId(
    edicionId: string,
    catalogo: CatalogoRegistroOficial,
  ): Promise<ResultadoResolucionFuenteEdicion> {
    const edicion = await this.repositorioEdiciones.buscarPorId(edicionId);
    if (edicion === null) {
      return { edicionId, procesada: false, razon: 'EDICION_NO_ENCONTRADA' };
    }
    return this.resolverEdicion(edicion, catalogo);
  }

  private async resolverEdicion(
    edicion: EdicionRegistroOficial,
    catalogo: CatalogoRegistroOficial,
  ): Promise<ResultadoResolucionFuenteEdicion> {
    if (!edicion.admiteResolucionAutomatica() || edicion.urlPdf !== null) {
      return {
        edicionId: edicion.id,
        procesada: false,
        razon: 'FUENTE_YA_ESTABLECIDA',
      };
    }

    const consulta = await catalogo.buscarEdiciones({
      tipoPublicacionRegistroOficial: edicion.tipoPublicacionRegistroOficial,
      numeroPublicacionRegistroOficial:
        edicion.numeroPublicacionRegistroOficial,
      fechaPublicacionOficial: edicion.fechaPublicacionOficial,
    });

    // Un fallo del catálogo NO cambia el estado persistido de la edición y NO
    // equivale a NO_ENCONTRADA. La razón del puerto se conserva tal cual:
    // distinguir un fallo transitorio de uno estructural o de cobertura es
    // parte del contrato observable.
    if (!consulta.exitoso) {
      return {
        edicionId: edicion.id,
        procesada: false,
        razon: consulta.razon,
      };
    }

    const resuelta = decidirResolucion(edicion, consulta.candidatas);
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

  /**
   * Recorre `elementos` con paralelismo acotado, preservando el orden de
   * entrada en los resultados (determinista) sin lanzar concurrencia externa
   * ilimitada.
   */
  private async procesarEnLote<T>(
    elementos: T[],
    resolver: (elemento: T) => Promise<ResultadoResolucionFuenteEdicion>,
  ): Promise<ResultadoResolucionFuenteEdicion[]> {
    const resultados = new Array<ResultadoResolucionFuenteEdicion>(
      elementos.length,
    );
    let siguiente = 0;

    const trabajador = async (): Promise<void> => {
      while (siguiente < elementos.length) {
        const indice = siguiente;
        siguiente += 1;
        resultados[indice] = await resolver(elementos[indice]);
      }
    };

    const cantidadTrabajadores = Math.max(
      1,
      Math.min(this.maxConcurrencia, elementos.length),
    );
    await Promise.all(
      Array.from({ length: cantidadTrabajadores }, () => trabajador()),
    );
    return resultados;
  }

  private esSolicitudValida(
    solicitud: SolicitudResolverFuenteRegistroOficial,
  ): boolean {
    if (esTextoVacio(solicitud.usuarioAutenticadoId)) {
      return false;
    }
    // `edicionIds` y `limite` son selectores mutuamente excluyentes: aceptar
    // ambos e ignorar uno en silencio ocultaría la intención de la solicitud.
    if (
      solicitud.edicionIds !== undefined &&
      solicitud.limite !== undefined
    ) {
      return false;
    }
    if (
      solicitud.limite !== undefined &&
      (!Number.isInteger(solicitud.limite) || solicitud.limite <= 0)
    ) {
      return false;
    }
    if (solicitud.edicionIds === undefined) {
      return true;
    }
    if (
      !Array.isArray(solicitud.edicionIds) ||
      solicitud.edicionIds.length === 0 ||
      solicitud.edicionIds.some((id) => esTextoVacio(id))
    ) {
      return false;
    }
    const normalizados = solicitud.edicionIds.map((id) => id.trim());
    // IDs duplicados se rechazan: evita procesar dos veces la misma edición y
    // reportes ambiguos.
    if (new Set(normalizados).size !== normalizados.length) {
      return false;
    }
    // El lote explícito también está acotado por el máximo seguro.
    return normalizados.length <= this.limiteMaximoEdiciones;
  }
}

/**
 * El catálogo se consulta por tipo + número + fecha; la fecha detectada
 * verifica la confianza de la coincidencia. Una discrepancia de fecha no
 * sobrescribe lo detectado: si genera ambigüedad, la edición queda CONFLICTIVA.
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
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

function normalizarLimite(valor: number | undefined, porDefecto: number): number {
  return valor !== undefined && Number.isInteger(valor) && valor > 0
    ? valor
    : porDefecto;
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
