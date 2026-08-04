import { RepositorioUsuarios } from '../../normas/puertos/RepositorioUsuarios';
import { DescargadorPdfIndiceRegistroOficial } from '../puertos/DescargadorPdfIndiceRegistroOficial';
import { ExtractorIndiceMensualRegistroOficial } from '../puertos/ExtractorIndiceMensualRegistroOficial';
import { EntradaDetectadaResumen } from '../modelos/IngestaRegistroOficial';
import { PoliticaIngestaRegistroOficial } from '../politicas/PoliticaIngestaRegistroOficial';

export type SolicitudAnalizarIndiceMensualRegistroOficial = {
  usuarioAutenticadoId: string;
  urlPdf: string;
  periodoEsperado: { anio: number; mes: number };
};

/**
 * Unión de todas las razones de fallo posibles: propias de este caso de uso
 * más las que propagan tal cual, sin traducir, los dos puertos técnicos.
 */
export type RazonAnalizarIndiceMensualFallido =
  | 'SOLICITUD_INVALIDA'
  | 'ACCESO_DENEGADO'
  | 'PERIODO_INDICE_NO_COINCIDE'
  | 'URL_PDF_INDICE_NO_PERMITIDA'
  | 'PDF_INDICE_DEMASIADO_GRANDE'
  | 'DESCARGA_INDICE_INVALIDA'
  | 'DESCARGA_INDICE_TEMPORALMENTE_NO_DISPONIBLE'
  | 'PDF_INDICE_INVALIDO'
  | 'PDF_INDICE_CIFRADO'
  | 'PDF_INDICE_SIN_CAPA_DE_TEXTO'
  | 'PERIODO_INDICE_NO_DETECTADO';

export type EstadisticasAnalisisIndiceMensual = {
  periodoEsperado: { anio: number; mes: number };
  periodoDetectado: { anio: number; mes: number };
  sha256Pdf: string;
  versionExtractor: string;
  tamanioBytes: number;
  totalPaginas: number;
  totalEntradas: number;
  totalConAdvertencias: number;
  /** Conteo determinista por código de advertencia (orden de primera aparición). */
  advertenciasPorTipo: Record<string, number>;
};

export type ResultadoAnalizarIndiceMensualRegistroOficial =
  | {
      exitoso: true;
      analisis: EstadisticasAnalisisIndiceMensual;
      /** Todas las entradas detectadas, sin muestreo: un mes incompatible
       * no debe poder ocultarse detrás de una muestra parcial. */
      entradasDetectadas: EntradaDetectadaResumen[];
    }
  | {
      exitoso: false;
      razon: RazonAnalizarIndiceMensualFallido;
    };

export interface DependenciasAnalizarIndiceMensualRegistroOficial {
  repositorioUsuarios: RepositorioUsuarios;
  descargadorPdf: DescargadorPdfIndiceRegistroOficial;
  extractorIndice: ExtractorIndiceMensualRegistroOficial;
  politicaIngesta?: PoliticaIngestaRegistroOficial;
}

/**
 * Analiza un índice mensual del Registro Oficial a partir de una URL directa
 * del PDF oficial (Fase 5D): descarga, valida, detecta período y ejecuta el
 * extractor de Fase 5C — sin escribir absolutamente nada en repositorios de
 * ingesta, normas o ediciones. No recibe puertos con capacidad de escritura
 * sobre lotes, entradas, normas ni ediciones: la ausencia de esa escritura
 * es una garantía estructural, no solo de comportamiento. Sí depende de
 * `RepositorioUsuarios` (puerto persistente de solo lectura) exclusivamente
 * para autenticar y autorizar al actor. Solo `SUPERADMINISTRADOR`,
 * verificado antes de tocar red (descarga/extracción nunca se invocan para
 * un actor no autorizado).
 */
export class AnalizarIndiceMensualRegistroOficial {
  private readonly repositorioUsuarios: RepositorioUsuarios;
  private readonly descargadorPdf: DescargadorPdfIndiceRegistroOficial;
  private readonly extractorIndice: ExtractorIndiceMensualRegistroOficial;
  private readonly politicaIngesta: PoliticaIngestaRegistroOficial;

  constructor(dependencias: DependenciasAnalizarIndiceMensualRegistroOficial) {
    this.repositorioUsuarios = dependencias.repositorioUsuarios;
    this.descargadorPdf = dependencias.descargadorPdf;
    this.extractorIndice = dependencias.extractorIndice;
    this.politicaIngesta =
      dependencias.politicaIngesta ?? new PoliticaIngestaRegistroOficial();
  }

  async ejecutar(
    solicitud: SolicitudAnalizarIndiceMensualRegistroOficial,
  ): Promise<ResultadoAnalizarIndiceMensualRegistroOficial> {
    if (!esSolicitudAnalizarValida(solicitud)) {
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }

    const actor = await this.repositorioUsuarios.buscarPorId(
      solicitud.usuarioAutenticadoId,
    );
    if (actor === null || !this.politicaIngesta.puedeIngerirResumenes(actor)) {
      return { exitoso: false, razon: 'ACCESO_DENEGADO' };
    }

    const descarga = await this.descargadorPdf.descargar(solicitud.urlPdf);
    if (!descarga.exitoso) {
      return { exitoso: false, razon: descarga.razon };
    }

    const extraccion = await this.extractorIndice.extraer(descarga.bytes);
    if (!extraccion.exitoso) {
      return { exitoso: false, razon: extraccion.razon };
    }

    if (
      extraccion.periodoDetectado.anio !== solicitud.periodoEsperado.anio ||
      extraccion.periodoDetectado.mes !== solicitud.periodoEsperado.mes
    ) {
      return { exitoso: false, razon: 'PERIODO_INDICE_NO_COINCIDE' };
    }

    let totalConAdvertencias = 0;
    const advertenciasPorTipo: Record<string, number> = {};
    for (const entrada of extraccion.entradasDetectadas) {
      if (entrada.advertencias.length > 0) {
        totalConAdvertencias += 1;
      }
      for (const advertencia of entrada.advertencias) {
        advertenciasPorTipo[advertencia] =
          (advertenciasPorTipo[advertencia] ?? 0) + 1;
      }
    }

    return {
      exitoso: true,
      analisis: {
        periodoEsperado: solicitud.periodoEsperado,
        periodoDetectado: extraccion.periodoDetectado,
        sha256Pdf: descarga.sha256Pdf,
        versionExtractor: this.extractorIndice.versionExtractor,
        tamanioBytes: descarga.tamanioBytes,
        totalPaginas: extraccion.totalPaginas,
        totalEntradas: extraccion.entradasDetectadas.length,
        totalConAdvertencias,
        advertenciasPorTipo,
      },
      entradasDetectadas: extraccion.entradasDetectadas,
    };
  }
}

function esSolicitudAnalizarValida(
  solicitud: SolicitudAnalizarIndiceMensualRegistroOficial,
): boolean {
  if (esTextoVacio(solicitud.usuarioAutenticadoId)) return false;
  if (esTextoVacio(solicitud.urlPdf)) return false;
  return esPeriodoValido(solicitud.periodoEsperado);
}

function esTextoVacio(valor: unknown): boolean {
  return typeof valor !== 'string' || valor.trim().length === 0;
}

function esPeriodoValido(
  periodo: unknown,
): periodo is { anio: number; mes: number } {
  if (periodo === null || typeof periodo !== 'object') return false;
  const p = periodo as { anio?: unknown; mes?: unknown };
  return (
    typeof p.anio === 'number' &&
    Number.isInteger(p.anio) &&
    p.anio >= 1900 &&
    p.anio <= 2100 &&
    typeof p.mes === 'number' &&
    Number.isInteger(p.mes) &&
    p.mes >= 1 &&
    p.mes <= 12
  );
}
