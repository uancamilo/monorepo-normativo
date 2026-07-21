import {
  EdicionRegistroOficial,
  EstadoEditorialNorma,
  EstadoNorma,
  EstadoResolucionFuente,
  Norma,
  parsearFechaCalendario,
} from '@normativo/dominio';
import { RepositorioUsuarios } from '../../normas/puertos/RepositorioUsuarios';
import { GeneradorIds } from '../../normas/puertos/GeneradorIds';
import { RepositorioEdicionesRegistroOficial } from '../../normas/puertos/RepositorioEdicionesRegistroOficial';
import { RepositorioIngestaRegistroOficial } from '../puertos/RepositorioIngestaRegistroOficial';
import {
  EntradaDetectadaRegistroOficialAPersistir,
  EntradaDetectadaResumen,
  LoteIngestaRegistroOficial,
  PublicacionRegistroOficialDetectada,
  TIPOS_PUBLICACION_REGISTRO_OFICIAL,
} from '../modelos/IngestaRegistroOficial';
import {
  armarResumenLoteIngesta,
  ResumenLoteIngestaRegistroOficial,
} from '../modelos/VistasIngestaRegistroOficial';
import { CalculadoraHuellaLote } from '../servicios/CalculadoraHuellaLote';
import { PoliticaIngestaRegistroOficial } from '../politicas/PoliticaIngestaRegistroOficial';

export const LIMITE_PREDETERMINADO_ENTRADAS_INGESTA = 1500;

export type SolicitudIngerirResumenRegistroOficial = {
  usuarioAutenticadoId: string;
  periodo: { anio: number; mes: number };
  urlResumenMensualRegistroOficial: string;
  versionExtractor: string;
  entradasDetectadas: EntradaDetectadaResumen[];
};

export type RazonIngerirResumenRegistroOficialFallido =
  | 'SOLICITUD_INVALIDA'
  | 'LIMITE_ENTRADAS_INGESTA_EXCEDIDO'
  | 'ACCESO_DENEGADO'
  | 'EJECUCION_INGESTA_CONFLICTIVA';

export type ResultadoIngerirResumenRegistroOficial =
  | {
      exitoso: true;
      lote: ResumenLoteIngestaRegistroOficial;
      /** false cuando el mismo resumen mensual ya había sido persistido. */
      creado: boolean;
    }
  | {
      exitoso: false;
      razon: RazonIngerirResumenRegistroOficialFallido;
    };

export interface DependenciasIngerirResumenRegistroOficial {
  repositorioUsuarios: RepositorioUsuarios;
  repositorioIngesta: RepositorioIngestaRegistroOficial;
  repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  generadorIds: GeneradorIds;
  calculadoraHuellaLote?: CalculadoraHuellaLote;
  politicaIngesta?: PoliticaIngestaRegistroOficial;
  /** Límite operativo inyectado por infraestructura; 1500 por defecto. */
  limiteMaximoEntradas?: number;
}

/**
 * Ingesta por lote del resumen mensual del Registro Oficial
 * (`deteccionResumenMensual`, Fase 5A). Solo SUPERADMINISTRADOR. Cada entrada
 * detectada crea una Norma en BORRADOR (nunca publica). Solo puede existir
 * un lote por período mensual; una repetición idéntica reutiliza el lote.
 *
 * La detección identifica la edición del Registro Oficial (tipo + número +
 * fecha) y crea o reutiliza su EdicionRegistroOficial con urlPdf null y
 * resolución PENDIENTE: la URL del PDF oficial NO se detecta aquí, la
 * resuelve después `resolucionFuenteRegistroOficial` una sola vez por
 * edición. Si el extractor no detectó un campo, la Norma queda con ese campo
 * vacío o nulo según su tipo: no se inventan placeholders y la URL del
 * resumen mensual nunca se usa como fuente.
 */
export class IngerirResumenRegistroOficial {
  private readonly repositorioUsuarios: RepositorioUsuarios;
  private readonly repositorioIngesta: RepositorioIngestaRegistroOficial;
  private readonly repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  private readonly generadorIds: GeneradorIds;
  private readonly calculadoraHuellaLote: CalculadoraHuellaLote;
  private readonly politicaIngesta: PoliticaIngestaRegistroOficial;
  private readonly limiteMaximoEntradas: number;

  constructor(dependencias: DependenciasIngerirResumenRegistroOficial) {
    this.repositorioUsuarios = dependencias.repositorioUsuarios;
    this.repositorioIngesta = dependencias.repositorioIngesta;
    this.repositorioEdiciones = dependencias.repositorioEdiciones;
    this.generadorIds = dependencias.generadorIds;
    this.calculadoraHuellaLote =
      dependencias.calculadoraHuellaLote ?? new CalculadoraHuellaLote();
    this.politicaIngesta =
      dependencias.politicaIngesta ?? new PoliticaIngestaRegistroOficial();
    const limite =
      dependencias.limiteMaximoEntradas ??
      LIMITE_PREDETERMINADO_ENTRADAS_INGESTA;
    if (!Number.isInteger(limite) || limite <= 0) {
      throw new Error('El límite máximo de entradas de ingesta debe ser un entero positivo');
    }
    this.limiteMaximoEntradas = limite;
  }

  async ejecutar(
    solicitud: SolicitudIngerirResumenRegistroOficial,
  ): Promise<ResultadoIngerirResumenRegistroOficial> {
    if (!esSolicitudLoteValida(solicitud)) {
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }
    if (solicitud.entradasDetectadas.length > this.limiteMaximoEntradas) {
      return {
        exitoso: false,
        razon: 'LIMITE_ENTRADAS_INGESTA_EXCEDIDO',
      };
    }

    const actor = await this.repositorioUsuarios.buscarPorId(
      solicitud.usuarioAutenticadoId,
    );
    if (actor === null || !this.politicaIngesta.puedeIngerirResumenes(actor)) {
      return { exitoso: false, razon: 'ACCESO_DENEGADO' };
    }

    const huellaLote = this.calculadoraHuellaLote.calcular({
      periodo: solicitud.periodo,
      urlResumenMensualRegistroOficial:
        solicitud.urlResumenMensualRegistroOficial,
      versionExtractor: solicitud.versionExtractor,
      entradasDetectadas: solicitud.entradasDetectadas,
    });

    const loteDelPeriodo = await this.repositorioIngesta.buscarLotePorPeriodo(
      solicitud.periodo.anio,
      solicitud.periodo.mes,
    );
    if (loteDelPeriodo !== null) {
      return this.resolverLoteExistente(loteDelPeriodo, huellaLote);
    }

    const loteId = this.generadorIds.generar();
    const procesadas = await this.procesarEntradasDetectadas(solicitud, loteId);

    const lote: LoteIngestaRegistroOficial = {
      id: loteId,
      huellaLote,
      periodoAnio: solicitud.periodo.anio,
      periodoMes: solicitud.periodo.mes,
      fechaEjecucion: new Date(),
      urlResumenMensualRegistroOficial:
        solicitud.urlResumenMensualRegistroOficial.trim(),
      versionExtractor: solicitud.versionExtractor.trim(),
    };

    const resultadoGuardar = await this.repositorioIngesta.guardarIngesta({
      lote,
      entradas: procesadas.entradas.map((entrada) => entrada.entrada),
      normas: procesadas.entradas.map((entrada) => entrada.norma),
      ediciones: procesadas.edicionesNuevas,
    });

    if (!resultadoGuardar.exitoso) {
      // Carrera: otro lote del mismo período mensual ganó la
      // persistencia. Se resuelve con la misma semántica idempotente.
      const ganador = await this.repositorioIngesta.buscarLotePorPeriodo(
        solicitud.periodo.anio,
        solicitud.periodo.mes,
      );
      if (ganador === null) {
        return { exitoso: false, razon: 'EJECUCION_INGESTA_CONFLICTIVA' };
      }
      return this.resolverLoteExistente(ganador, huellaLote);
    }

    return {
      exitoso: true,
      lote: armarResumenLoteIngesta(
        lote,
        procesadas.entradas.map((entrada) => entrada.entrada),
      ),
      creado: true,
    };
  }

  private async resolverLoteExistente(
    lote: LoteIngestaRegistroOficial,
    huellaLote: string,
  ): Promise<ResultadoIngerirResumenRegistroOficial> {
    if (lote.huellaLote !== huellaLote) {
      return { exitoso: false, razon: 'EJECUCION_INGESTA_CONFLICTIVA' };
    }

    const entradas = await this.repositorioIngesta.listarEntradasPorLoteId(
      lote.id,
    );
    return {
      exitoso: true,
      lote: armarResumenLoteIngesta(lote, entradas),
      creado: false,
    };
  }

  private async procesarEntradasDetectadas(
    solicitud: SolicitudIngerirResumenRegistroOficial,
    loteId: string,
  ): Promise<{
    entradas: Array<{
      entrada: EntradaDetectadaRegistroOficialAPersistir;
      norma: Norma;
    }>;
    edicionesNuevas: EdicionRegistroOficial[];
  }> {
    const resultados: Array<{
      entrada: EntradaDetectadaRegistroOficialAPersistir;
      norma: Norma;
    }> = [];

    const edicionesDelLote = new Map<string, EdicionRegistroOficial>();
    const edicionesNuevas: EdicionRegistroOficial[] = [];

    const entradasOrdenadas = [...solicitud.entradasDetectadas].sort(
      (a, b) => a.posicion - b.posicion,
    );

    for (const entradaDetectada of entradasOrdenadas) {
      const derivado = derivarCamposNorma(entradaDetectada);

      const edicion = await this.buscarOCrearEdicion(
        derivado,
        edicionesDelLote,
        edicionesNuevas,
      );
      if (edicion === null) {
        derivado.advertencias.push('EDICION_REGISTRO_OFICIAL_NO_DETERMINADA');
      }

      const normaId = this.generadorIds.generar();
      const entradaId = this.generadorIds.generar();

      // La norma nace en BORRADOR con lo que el extractor detectó; los campos
      // no detectados quedan vacíos/nulos para corrección editorial posterior.
      // El contenido estructurado ([]) y la fecha de expedición no son
      // objetivos del scraping del resumen mensual.
      const norma = new Norma({
        id: normaId,
        numero: derivado.numeroDetectado,
        titulo: derivado.tituloDetectado ?? '',
        contenido: [],
        tipoNorma: derivado.tipoDetectado ?? '',
        institucionExpide: derivado.institucionDetectada ?? '',
        estadoJuridico: EstadoNorma.VIGENTE,
        estadoEditorial: EstadoEditorialNorma.BORRADOR,
        fechaExpedicion: null,
        edicionRegistroOficialId: edicion === null ? null : edicion.id,
        fechaPublicacionEnSistema: null,
      });

      const entrada: EntradaDetectadaRegistroOficialAPersistir = {
        id: entradaId,
        loteId,
        posicion: entradaDetectada.posicion,
        normaId,
        segmentoCrudo: derivado.segmentoCrudo,
        metadataExtraccion: derivado.metadataExtraccion,
        advertencias: derivado.advertencias,
        confianza: derivado.confianza,
        fechaCreacion: new Date(),
        tipoDetectado: derivado.tipoDetectado,
        numeroDetectado: derivado.numeroDetectado,
        tituloDetectado: derivado.tituloDetectado,
        institucionDetectada: derivado.institucionDetectada,
        seccion: normalizarTextoNullable(entradaDetectada.seccion),
        publicacionTipo: derivado.publicacionTipo,
        publicacionNumero: derivado.publicacionNumero,
        publicacionFecha: derivado.publicacionFecha,
      };

      resultados.push({ entrada, norma });
    }

    return { entradas: resultados, edicionesNuevas };
  }

  /**
   * La edición se identifica por la triple (tipo, número, fecha) de
   * publicación: si falta cualquiera, no se puede determinar la edición.
   * Varias normas del lote (y de lotes anteriores) comparten la misma
   * edición; una edición ya persistida nunca se recrea ni se toca su urlPdf.
   */
  private async buscarOCrearEdicion(
    derivado: CamposNormaDerivados,
    edicionesDelLote: Map<string, EdicionRegistroOficial>,
    edicionesNuevas: EdicionRegistroOficial[],
  ): Promise<EdicionRegistroOficial | null> {
    if (
      derivado.publicacionTipo === null ||
      derivado.publicacionNumero === null ||
      derivado.publicacionFecha === null
    ) {
      return null;
    }

    const clave = [
      derivado.publicacionTipo,
      String(derivado.publicacionNumero),
      derivado.publicacionFecha.toISOString().slice(0, 10),
    ].join('||');

    const enLote = edicionesDelLote.get(clave);
    if (enLote !== undefined) {
      return enLote;
    }

    const persistida = await this.repositorioEdiciones.buscarPorClave({
      tipoPublicacionRegistroOficial: derivado.publicacionTipo,
      numeroPublicacionRegistroOficial: derivado.publicacionNumero,
      fechaPublicacionOficial: derivado.publicacionFecha,
    });
    if (persistida !== null) {
      edicionesDelLote.set(clave, persistida);
      return persistida;
    }

    const nueva = new EdicionRegistroOficial({
      id: this.generadorIds.generar(),
      tipoPublicacionRegistroOficial: derivado.publicacionTipo,
      numeroPublicacionRegistroOficial: derivado.publicacionNumero,
      fechaPublicacionOficial: derivado.publicacionFecha,
      urlPdf: null,
      estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
    });
    edicionesDelLote.set(clave, nueva);
    edicionesNuevas.push(nueva);
    return nueva;
  }
}

type CamposNormaDerivados = {
  tipoDetectado: string | null;
  numeroDetectado: string | null;
  tituloDetectado: string | null;
  institucionDetectada: string | null;
  publicacionTipo: string | null;
  publicacionNumero: number | null;
  publicacionFecha: Date | null;
  segmentoCrudo: string;
  metadataExtraccion: Record<string, unknown>;
  advertencias: string[];
  confianza: number;
};

/**
 * Normaliza lo detectado por el extractor sin inventar valores: los campos no
 * detectados quedan nulos y solo se registra una advertencia de trazabilidad
 * en la entrada del lote.
 */
function derivarCamposNorma(
  entrada: EntradaDetectadaResumen,
): CamposNormaDerivados {
  const advertencias = [...normalizarListaTexto(entrada.advertencias)];

  const publicacion = normalizarPublicacion(entrada.publicacion, advertencias);

  const tipoDetectado = normalizarTextoNullable(entrada.tipo);
  if (tipoDetectado === null) {
    advertencias.push('TIPO_NORMA_NO_DETECTADO');
  }

  const numeroDetectado = normalizarTextoNullable(entrada.numero);

  const tituloDetectado = normalizarTextoNullable(entrada.titulo);
  if (tituloDetectado === null) {
    advertencias.push('TITULO_NO_DETECTADO');
  }

  const institucionDetectada = normalizarTextoNullable(entrada.institucion);
  if (institucionDetectada === null) {
    advertencias.push('INSTITUCION_NO_DETECTADA');
  }

  const segmentoCrudo = normalizarTextoNullable(entrada.segmentoCrudo);
  if (segmentoCrudo === null) {
    advertencias.push('SEGMENTO_CRUDO_NO_DISPONIBLE');
  }

  const confianza =
    typeof entrada.confianza === 'number' &&
    Number.isFinite(entrada.confianza) &&
    entrada.confianza >= 0 &&
    entrada.confianza <= 1
      ? entrada.confianza
      : 0;
  if (confianza !== entrada.confianza) {
    advertencias.push('CONFIANZA_INVALIDA');
  }

  return {
    tipoDetectado,
    numeroDetectado,
    tituloDetectado,
    institucionDetectada,
    publicacionTipo: publicacion.tipo,
    publicacionNumero: publicacion.numero,
    publicacionFecha: publicacion.fecha,
    segmentoCrudo: segmentoCrudo ?? '',
    metadataExtraccion: esObjetoPlano(entrada.metadataExtraccion)
      ? entrada.metadataExtraccion
      : {},
    advertencias,
    confianza,
  };
}

type PublicacionNormalizada = {
  tipo: string | null;
  numero: number | null;
  fecha: Date | null;
};

function normalizarPublicacion(
  publicacion: PublicacionRegistroOficialDetectada | null,
  advertencias: string[],
): PublicacionNormalizada {
  const tipoCrudo =
    publicacion === null ? null : normalizarTextoNullable(publicacion.tipo);
  const tipo =
    tipoCrudo !== null &&
    TIPOS_PUBLICACION_REGISTRO_OFICIAL.includes(tipoCrudo as never)
      ? tipoCrudo
      : null;
  if (tipo === null) {
    advertencias.push('TIPO_PUBLICACION_REGISTRO_OFICIAL_NO_DETECTADO');
  }

  const numero =
    publicacion !== null &&
    esEnteroValido(publicacion.numero) &&
    publicacion.numero > 0
      ? publicacion.numero
      : null;
  if (numero === null) {
    advertencias.push('NUMERO_PUBLICACION_REGISTRO_OFICIAL_NO_DETECTADO');
  }

  const fecha = interpretarFecha(publicacion?.fecha ?? null);
  if (fecha === null) {
    advertencias.push('FECHA_PUBLICACION_REGISTRO_OFICIAL_NO_DETECTADA');
  }

  return { tipo, numero, fecha };
}

function esSolicitudLoteValida(
  solicitud: SolicitudIngerirResumenRegistroOficial,
): boolean {
  if (
    esTextoVacio(solicitud.usuarioAutenticadoId) ||
    esTextoVacio(solicitud.versionExtractor) ||
    esTextoVacio(solicitud.urlResumenMensualRegistroOficial) ||
    !esUrlValida(solicitud.urlResumenMensualRegistroOficial.trim())
  ) {
    return false;
  }

  if (
    solicitud.periodo === null ||
    typeof solicitud.periodo !== 'object' ||
    !esEnteroValido(solicitud.periodo.anio) ||
    solicitud.periodo.anio < 1900 ||
    solicitud.periodo.anio > 2100 ||
    !esEnteroValido(solicitud.periodo.mes) ||
    solicitud.periodo.mes < 1 ||
    solicitud.periodo.mes > 12
  ) {
    return false;
  }

  if (
    !Array.isArray(solicitud.entradasDetectadas) ||
    solicitud.entradasDetectadas.length === 0
  ) {
    return false;
  }

  const posiciones = new Set<number>();
  for (const entrada of solicitud.entradasDetectadas) {
    if (
      entrada === null ||
      typeof entrada !== 'object' ||
      !esEnteroValido(entrada.posicion) ||
      entrada.posicion < 0 ||
      posiciones.has(entrada.posicion)
    ) {
      return false;
    }
    posiciones.add(entrada.posicion);

    if (entrada.publicacion !== null) {
      if (
        typeof entrada.publicacion !== 'object' ||
        Array.isArray(entrada.publicacion)
      ) {
        return false;
      }
      if (
        entrada.publicacion.fecha !== null &&
        parsearFechaCalendario(entrada.publicacion.fecha) === null
      ) {
        return false;
      }
    }
  }

  return true;
}

function esTextoVacio(valor: unknown): boolean {
  return typeof valor !== 'string' || valor.trim().length === 0;
}

function normalizarTextoNullable(valor: unknown): string | null {
  if (typeof valor !== 'string' || valor.trim().length === 0) {
    return null;
  }
  return valor.trim();
}

function normalizarListaTexto(valor: unknown): string[] {
  if (!Array.isArray(valor)) {
    return [];
  }
  return valor.filter(
    (elemento): elemento is string =>
      typeof elemento === 'string' && elemento.trim().length > 0,
  );
}

function esObjetoPlano(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

function esEnteroValido(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor);
}

function esUrlValida(valor: string): boolean {
  try {
    new URL(valor);
    return true;
  } catch {
    return false;
  }
}

function interpretarFecha(valor: string | null): Date | null {
  if (typeof valor !== 'string') {
    return null;
  }
  return parsearFechaCalendario(valor);
}
