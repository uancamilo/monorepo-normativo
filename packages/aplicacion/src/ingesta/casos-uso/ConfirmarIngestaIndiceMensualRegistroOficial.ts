import { RepositorioUsuarios } from '../../normas/puertos/RepositorioUsuarios';
import { DescargadorPdfIndiceRegistroOficial } from '../puertos/DescargadorPdfIndiceRegistroOficial';
import { ExtractorIndiceMensualRegistroOficial } from '../puertos/ExtractorIndiceMensualRegistroOficial';
import { PoliticaIngestaRegistroOficial } from '../politicas/PoliticaIngestaRegistroOficial';
import {
  IngerirResumenRegistroOficial,
  RazonIngerirResumenRegistroOficialFallido,
} from './IngerirResumenRegistroOficial';
import { ResumenLoteIngestaRegistroOficial } from '../modelos/VistasIngestaRegistroOficial';

export type SolicitudConfirmarIngestaIndiceMensualRegistroOficial = {
  usuarioAutenticadoId: string;
  urlPdf: string;
  periodoEsperado: { anio: number; mes: number };
  /** SHA-256 (64 hex minúsculas) observado durante el análisis previo. */
  sha256PdfObservado: string;
  /** Versión del extractor observada durante el análisis previo. */
  versionExtractorObservada: string;
};

export type RazonConfirmarIngestaIndiceMensualFallido =
  | 'SOLICITUD_INVALIDA'
  | 'ACCESO_DENEGADO'
  | 'VERSION_EXTRACTOR_CAMBIO_DESDE_ANALISIS'
  | 'URL_PDF_INDICE_NO_PERMITIDA'
  | 'PDF_INDICE_DEMASIADO_GRANDE'
  | 'DESCARGA_INDICE_INVALIDA'
  | 'DESCARGA_INDICE_TEMPORALMENTE_NO_DISPONIBLE'
  | 'PDF_INDICE_CAMBIO_DESDE_ANALISIS'
  | 'PDF_INDICE_INVALIDO'
  | 'PDF_INDICE_CIFRADO'
  | 'PDF_INDICE_SIN_CAPA_DE_TEXTO'
  | 'PERIODO_INDICE_NO_DETECTADO'
  | 'PERIODO_INDICE_NO_COINCIDE'
  | RazonIngerirResumenRegistroOficialFallido;

export type ResultadoConfirmarIngestaIndiceMensualRegistroOficial =
  | {
      exitoso: true;
      lote: ResumenLoteIngestaRegistroOficial;
      creado: boolean;
      sha256Pdf: string;
      versionExtractor: string;
    }
  | {
      exitoso: false;
      razon: RazonConfirmarIngestaIndiceMensualFallido;
    };

export interface DependenciasConfirmarIngestaIndiceMensualRegistroOficial {
  repositorioUsuarios: RepositorioUsuarios;
  descargadorPdf: DescargadorPdfIndiceRegistroOficial;
  extractorIndice: ExtractorIndiceMensualRegistroOficial;
  /**
   * Instancia ya construida de `IngerirResumenRegistroOficial`, tratada como
   * caja negra: este caso de uso nunca reimplementa huella, idempotencia,
   * transacción ni la carrera por período — se compone por inyección y se
   * delega íntegramente.
   */
  ingerirResumen: IngerirResumenRegistroOficial;
  politicaIngesta?: PoliticaIngestaRegistroOficial;
}

/**
 * Confirma la ingesta de un índice mensual ya revisado con `Analizar`
 * (Fase 5D): vuelve a descargar el PDF desde cero (nunca reutiliza bytes de
 * un análisis previo), exige coincidencia exacta de versión del extractor
 * (antes de descargar) y de SHA-256 (antes de extraer), vuelve a extraer y
 * a exigir coincidencia exacta de período, y solo entonces delega en
 * `IngerirResumenRegistroOficial` — nunca resuelve fuentes ni publica
 * normas.
 */
export class ConfirmarIngestaIndiceMensualRegistroOficial {
  private readonly repositorioUsuarios: RepositorioUsuarios;
  private readonly descargadorPdf: DescargadorPdfIndiceRegistroOficial;
  private readonly extractorIndice: ExtractorIndiceMensualRegistroOficial;
  private readonly ingerirResumen: IngerirResumenRegistroOficial;
  private readonly politicaIngesta: PoliticaIngestaRegistroOficial;

  constructor(
    dependencias: DependenciasConfirmarIngestaIndiceMensualRegistroOficial,
  ) {
    this.repositorioUsuarios = dependencias.repositorioUsuarios;
    this.descargadorPdf = dependencias.descargadorPdf;
    this.extractorIndice = dependencias.extractorIndice;
    this.ingerirResumen = dependencias.ingerirResumen;
    this.politicaIngesta =
      dependencias.politicaIngesta ?? new PoliticaIngestaRegistroOficial();
  }

  async ejecutar(
    solicitud: SolicitudConfirmarIngestaIndiceMensualRegistroOficial,
  ): Promise<ResultadoConfirmarIngestaIndiceMensualRegistroOficial> {
    if (!esSolicitudConfirmarValida(solicitud)) {
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }

    const actor = await this.repositorioUsuarios.buscarPorId(
      solicitud.usuarioAutenticadoId,
    );
    if (actor === null || !this.politicaIngesta.puedeIngerirResumenes(actor)) {
      return { exitoso: false, razon: 'ACCESO_DENEGADO' };
    }

    // Comprobación de versión ANTES de descargar: protege una confirmación
    // realizada después de un despliegue que cambió el extractor.
    if (
      solicitud.versionExtractorObservada !==
      this.extractorIndice.versionExtractor
    ) {
      return {
        exitoso: false,
        razon: 'VERSION_EXTRACTOR_CAMBIO_DESDE_ANALISIS',
      };
    }

    const descarga = await this.descargadorPdf.descargar(solicitud.urlPdf);
    if (!descarga.exitoso) {
      return { exitoso: false, razon: descarga.razon };
    }

    // Comprobación de hash ANTES de extraer: si el PDF cambió entre el
    // análisis y la confirmación, no se extrae ni se ingiere nada.
    if (descarga.sha256Pdf !== solicitud.sha256PdfObservado) {
      return { exitoso: false, razon: 'PDF_INDICE_CAMBIO_DESDE_ANALISIS' };
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

    const resultadoIngesta = await this.ingerirResumen.ejecutar({
      usuarioAutenticadoId: solicitud.usuarioAutenticadoId,
      periodo: extraccion.periodoDetectado,
      urlResumenMensualRegistroOficial: solicitud.urlPdf,
      versionExtractor: this.extractorIndice.versionExtractor,
      entradasDetectadas: extraccion.entradasDetectadas,
    });

    if (!resultadoIngesta.exitoso) {
      return { exitoso: false, razon: resultadoIngesta.razon };
    }

    return {
      exitoso: true,
      lote: resultadoIngesta.lote,
      creado: resultadoIngesta.creado,
      sha256Pdf: descarga.sha256Pdf,
      versionExtractor: this.extractorIndice.versionExtractor,
    };
  }
}

function esSolicitudConfirmarValida(
  solicitud: SolicitudConfirmarIngestaIndiceMensualRegistroOficial,
): boolean {
  if (esTextoVacio(solicitud.usuarioAutenticadoId)) return false;
  if (esTextoVacio(solicitud.urlPdf)) return false;
  if (!esPeriodoValido(solicitud.periodoEsperado)) return false;
  if (!esSha256Valido(solicitud.sha256PdfObservado)) return false;
  if (esTextoVacio(solicitud.versionExtractorObservada)) return false;
  return true;
}

function esTextoVacio(valor: unknown): boolean {
  return typeof valor !== 'string' || valor.trim().length === 0;
}

function esSha256Valido(valor: unknown): boolean {
  return typeof valor === 'string' && /^[0-9a-f]{64}$/.test(valor);
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
