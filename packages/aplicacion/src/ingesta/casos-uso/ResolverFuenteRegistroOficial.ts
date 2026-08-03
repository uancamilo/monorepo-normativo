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
import { ConsultorEdicionesRegistroOficialPorLote } from '../../normas/puertos/ConsultorEdicionesRegistroOficialPorLote';
import { PoliticaIngestaRegistroOficial } from '../politicas/PoliticaIngestaRegistroOficial';
import {
  codificarCursorEdicionesLote,
  decodificarCursorEdicionesLote,
} from './cursor-edicion-lote';

/**
 * Tope operativo por ejecución: el catálogo oficial es un servicio externo y
 * puede haber miles de pendientes; una sola llamada HTTP no debe procesarlas
 * todas. Configurable en infraestructura.
 */
export const LIMITE_PREDETERMINADO_EDICIONES_RESOLUCION = 50;

/**
 * Tamaño de página por defecto del modo `loteId`, distinto del modo global
 * (50): una página operativa recomendada para revisar manualmente el
 * resultado de un lote de ingesta recién creado. Sigue acotada por el mismo
 * máximo absoluto configurado (`limiteMaximoEdiciones`).
 */
export const LIMITE_PREDETERMINADO_EDICIONES_RESOLUCION_LOTE = 20;

/**
 * Paralelismo interno por defecto al consultar el catálogo. Acota la presión
 * sobre el sitio oficial sin serializar por completo. Configurable.
 */
export const CONCURRENCIA_PREDETERMINADA_RESOLUCION = 4;

export type SolicitudResolverFuenteRegistroOficial = {
  usuarioAutenticadoId: string;
  /**
   * Ediciones concretas a resolver. Si se omite (y no se usa `loteId`), se
   * resuelve un lote acotado de PENDIENTE sin `urlPdf`, en orden
   * determinista. Mutuamente excluyente con `limite`, `loteId` y `cursor`.
   */
  edicionIds?: string[];
  /**
   * Tope del lote de pendientes a procesar (modo global) o tamaño de página
   * (modo `loteId`). Nunca supera el máximo seguro configurado (se toma el
   * menor de ambos). Compatible con `loteId`; mutuamente excluyente con
   * `edicionIds`.
   */
  limite?: number;
  /**
   * Selecciona exclusivamente las ediciones únicas originadas por las
   * triples (tipo, número, fecha) persistidas en las entradas de este lote
   * de ingesta — nunca por la asociación editorial actual de la Norma.
   * Mutuamente excluyente con `edicionIds`. Compatible con `limite` y
   * `cursor`.
   */
  loteId?: string;
  /**
   * Cursor opaco de continuación de una página previa del mismo `loteId`
   * (requiere `loteId`). Un cursor inválido, mal formado o perteneciente a
   * otro lote es SOLICITUD_INVALIDA.
   */
  cursor?: string;
};

export type RazonResolverFuenteFallido =
  | 'SOLICITUD_INVALIDA'
  | 'ACCESO_DENEGADO'
  | 'CATALOGO_NO_DISPONIBLE'
  | 'LOTE_NO_ENCONTRADO';

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

/**
 * Metadatos de paginación devueltos únicamente cuando la solicitud usó
 * `loteId`: los modos existentes ({}, `limite`, `edicionIds`) nunca incluyen
 * este campo, conservando exactamente su contrato de respuesta actual.
 */
export type PaginacionResolverFuenteLote = {
  /** Existen más ediciones PENDIENTE del lote después de esta página. */
  hayMas: boolean;
  /** Cursor opaco para continuar; `null` cuando `hayMas` es `false`. */
  siguienteCursor: string | null;
  /**
   * Ediciones únicas del lote que continúan PENDIENTE sin `urlPdf` después
   * de procesar esta página, incluidas las que fallaron técnicamente antes
   * del cursor actual. Puede ser mayor que cero incluso con `hayMas: false`
   * (el recorrido de esta ejecución terminó, pero quedaron fallos técnicos
   * para una futura ejecución desde el inicio, sin cursor).
   */
  pendientesRestantesLote: number;
};

export type ResultadoResolverFuenteRegistroOficial =
  | {
      exitoso: true;
      resultados: ResultadoResolucionFuenteEdicion[];
      /** Presente solo cuando la solicitud usó `loteId`. */
      paginacionLote?: PaginacionResolverFuenteLote;
    }
  | {
      exitoso: false;
      razon: RazonResolverFuenteFallido;
    };

export interface DependenciasResolverFuenteRegistroOficial {
  repositorioUsuarios: RepositorioUsuarios;
  repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  catalogoRegistroOficial?: CatalogoRegistroOficial;
  /**
   * Puerto de solo lectura que traduce un `loteId` a sus ediciones únicas
   * (vía las triples persistidas en las entradas del lote), set-based y sin
   * recorrer Normas. A diferencia del catálogo, no depende de una
   * integración externa habilitable: siempre se inyecta.
   */
  consultorEdicionesPorLote: ConsultorEdicionesRegistroOficialPorLote;
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
  private readonly consultorEdicionesPorLote: ConsultorEdicionesRegistroOficialPorLote;
  private readonly politicaIngesta: PoliticaIngestaRegistroOficial;
  private readonly limiteMaximoEdiciones: number;
  private readonly maxConcurrencia: number;

  constructor(dependencias: DependenciasResolverFuenteRegistroOficial) {
    this.repositorioUsuarios = dependencias.repositorioUsuarios;
    this.repositorioEdiciones = dependencias.repositorioEdiciones;
    this.catalogoRegistroOficial = dependencias.catalogoRegistroOficial;
    this.consultorEdicionesPorLote = dependencias.consultorEdicionesPorLote;
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

    if (solicitud.loteId !== undefined) {
      return this.ejecutarSobreLote(solicitud, solicitud.loteId.trim(), catalogo);
    }

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

  /**
   * Modo `loteId`: página estable de las ediciones únicas originadas por las
   * triples del lote (nunca por Norma), delegada íntegramente en
   * `ConsultorEdicionesRegistroOficialPorLote`. Reutiliza exactamente la
   * misma `resolverEdicion`/`procesarEnLote` que los demás modos: la
   * decisión de RESUELTA/NO_ENCONTRADA/CONFLICTIVA/fallo técnico no cambia.
   */
  private async ejecutarSobreLote(
    solicitud: SolicitudResolverFuenteRegistroOficial,
    loteId: string,
    catalogo: CatalogoRegistroOficial,
  ): Promise<ResultadoResolverFuenteRegistroOficial> {
    // esSolicitudValida ya garantizó que, si `cursor` está presente,
    // decodifica correctamente contra este loteId; se repite aquí solo para
    // obtener el valor decodificado, nunca para volver a decidir validez.
    const cursor =
      solicitud.cursor !== undefined
        ? decodificarCursorEdicionesLote(loteId, solicitud.cursor)
        : null;
    const limitePagina = solicitud.limite
      ? Math.min(solicitud.limite, this.limiteMaximoEdiciones)
      : Math.min(
          LIMITE_PREDETERMINADO_EDICIONES_RESOLUCION_LOTE,
          this.limiteMaximoEdiciones,
        );

    const consulta = await this.consultorEdicionesPorLote.listarPaginaPendientes(
      loteId,
      limitePagina,
      cursor,
    );
    if (!consulta.loteEncontrado) {
      return { exitoso: false, razon: 'LOTE_NO_ENCONTRADO' };
    }

    const resultados = await this.procesarEnLote(
      consulta.ediciones,
      (edicion) => this.resolverEdicion(edicion, catalogo),
    );

    // El cursor siguiente ancla en la última edición de la página tal como
    // la entregó el puerto, sin importar si esa edición se resolvió o falló
    // técnicamente: así un fallo persistente no bloquea el avance dentro de
    // esta misma ejecución.
    const ultima = consulta.ediciones[consulta.ediciones.length - 1];
    const siguienteCursor =
      consulta.hayMas && ultima !== undefined
        ? codificarCursorEdicionesLote(loteId, {
            fechaPublicacionOficial: ultima.fechaPublicacionOficial,
            edicionId: ultima.id,
          })
        : null;
    const pendientesRestantesLote =
      await this.consultorEdicionesPorLote.contarPendientesDelLote(loteId);

    return {
      exitoso: true,
      resultados,
      paginacionLote: {
        hayMas: consulta.hayMas,
        siguienteCursor,
        pendientesRestantesLote,
      },
    };
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

    // Fail-closed: una sola candidata con URL no confiable invalida TODA la
    // respuesta. Descartar en silencio la inválida y seguir con las demás
    // permitiría resolver con datos parcialmente no verificables o, si no
    // quedara ninguna candidata tras el descarte, confundir una respuesta no
    // confiable con ausencia real (NO_ENCONTRADA). Ningún implementador del
    // puerto puede convertir aquí un dato no confiable en un estado terminal.
    if (consulta.candidatas.some((candidata) => !esUrlValida(candidata.urlPdf))) {
      return {
        edicionId: edicion.id,
        procesada: false,
        razon: 'RESPUESTA_CATALOGO_INVALIDA',
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
    // `edicionIds` es un selector explícito, mutuamente excluyente con
    // `limite`, `loteId` y `cursor`: aceptar una combinación e ignorar un
    // selector en silencio ocultaría la intención real de la solicitud.
    // `loteId` y `limite` en cambio SÍ pueden combinarse (tamaño de página).
    if (
      solicitud.edicionIds !== undefined &&
      (solicitud.limite !== undefined ||
        solicitud.loteId !== undefined ||
        solicitud.cursor !== undefined)
    ) {
      return false;
    }
    // Un cursor solo tiene sentido continuando la página de un loteId.
    if (solicitud.cursor !== undefined && solicitud.loteId === undefined) {
      return false;
    }
    if (
      solicitud.limite !== undefined &&
      (!Number.isInteger(solicitud.limite) || solicitud.limite <= 0)
    ) {
      return false;
    }

    if (solicitud.loteId !== undefined) {
      if (esTextoVacio(solicitud.loteId)) {
        return false;
      }
      // El cursor debe decodificar correctamente y pertenecer a este mismo
      // loteId; cualquier estructura inválida o de otro lote es
      // SOLICITUD_INVALIDA, nunca "sin cursor".
      if (
        solicitud.cursor !== undefined &&
        decodificarCursorEdicionesLote(
          solicitud.loteId.trim(),
          solicitud.cursor,
        ) === null
      ) {
        return false;
      }
      return true;
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
 *
 * Precondición: `candidatas` ya pasó el gate fail-closed de `resolverEdicion`
 * (ninguna URL no confiable); esta función solo deduplica por URL exacta y
 * decide, nunca vuelve a filtrar por validez.
 */
function decidirResolucion(
  edicion: EdicionRegistroOficial,
  candidatas: EdicionCatalogoRegistroOficial[],
): EdicionRegistroOficial {
  const candidatasUnicas = deduplicarPorUrl(candidatas);

  if (candidatasUnicas.length === 0) {
    return edicion.marcarFuenteNoEncontrada();
  }

  if (candidatasUnicas.length === 1) {
    const unica = candidatasUnicas[0];
    const fechaCompatible =
      unica.fechaPublicacionOficial === null ||
      esMismaFecha(unica.fechaPublicacionOficial, edicion.fechaPublicacionOficial);
    return fechaCompatible
      ? edicion.resolverFuente(unica.urlPdf)
      : edicion.marcarFuenteConflictiva();
  }

  const coincidentesPorFecha = candidatasUnicas.filter(
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

/**
 * Contrato mínimo y estable que aplicación puede validar sin conocer
 * infraestructura: la URL debe ser interpretable y usar protocolo `https:`
 * (http, ftp, file, javascript y cualquier otro protocolo se rechazan; ni
 * siquiera localhost se acepta como fuente PDF persistible). Esto es
 * defensa en profundidad, no un duplicado de la allowlist real: la
 * allowlist de dominios oficiales, el manejo de redirects, tamaño de
 * respuesta, timeout y el resto de la defensa SSRF viven exclusivamente en
 * infraestructura (`CatalogoRegistroOficialHttp`). Aplicación no conoce
 * dominios concretos, no implementa una allowlist de hosts y no importa
 * configuración ni infraestructura; solo evita que un implementador futuro
 * o defectuoso del puerto `CatalogoRegistroOficial` convierta una URL con
 * forma o protocolo no confiable en un estado terminal persistido.
 */
function esUrlValida(valor: string): boolean {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return false;
  }
  return url.protocol === 'https:';
}
