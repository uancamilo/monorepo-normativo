import { describe, expect, it } from '@jest/globals';
import {
  PdfCifradoError,
  PdfDemasiadoGrandeError,
  PdfInvalidoError,
  PdfSinCapaDeTextoError,
} from '../../extractor-registro-oficial/adaptador-pdfjs';
import type { PaginaLeida } from '../../extractor-registro-oficial/modelo-lectura-visual';
import type { ResultadoParseoDocumento } from '../../extractor-registro-oficial/modelo-entrada-parseada';
import type { IngerirResumenHttpDto } from '../../dto/ingerir-resumen-http.dto';
import type { OpcionesConstruccionPayload } from '../../extractor-registro-oficial/constructor-payload-ingesta';
import {
  ExtractorIndiceMensualRegistroOficialPdfjs,
  VERSION_EXTRACTOR_INDICE_MENSUAL_ACTUAL,
} from '../extractor-indice-mensual-adaptador';

/**
 * Suite de la lógica propia del adaptador (mapeo de excepciones tipadas a
 * razones discriminadas, ensamblado del resultado), con `leerPdf`/
 * `parsearDocumento`/`construirPayloadIngesta` inyectados como dobles: evita
 * tocar PDF.js (import() dinámico genuino, no soportado por el sandbox VM de
 * Jest sin --experimental-vm-modules, ver adaptador-pdfjs.ts). El ejercicio
 * contra el fixture PDF real de mayo de 2026 con las funciones reales vive en
 * extractor-indice-mensual-adaptador.compilado.test.ts (subproceso, mismo
 * patrón que cli.test.ts).
 */
const BYTES_CUALQUIERA = new Uint8Array([1, 2, 3]);
const PAGINA_FALSA: PaginaLeida = {
  numeroPagina: 1,
  anchoPagina: 100,
  altoPagina: 100,
  palabras: [],
};

function resultadoParseoConPeriodo(): ResultadoParseoDocumento {
  return { periodoDetectado: { anio: 2026, mes: 5 }, entradas: [] };
}

function resultadoParseoSinPeriodo(): ResultadoParseoDocumento {
  return { periodoDetectado: null, entradas: [] };
}

describe('ExtractorIndiceMensualRegistroOficialPdfjs', () => {
  it('expone la versión estable actual', () => {
    const adaptador = new ExtractorIndiceMensualRegistroOficialPdfjs();
    expect(adaptador.versionExtractor).toBe(
      VERSION_EXTRACTOR_INDICE_MENSUAL_ACTUAL,
    );
    expect(adaptador.versionExtractor).toBe('indice-mensual-v1');
  });

  it('PDF_INDICE_CIFRADO: propaga PdfCifradoError de leerPdf como razón discriminada', async () => {
    const adaptador = new ExtractorIndiceMensualRegistroOficialPdfjs(
      async () => {
        throw new PdfCifradoError('cifrado');
      },
    );
    const resultado = await adaptador.extraer(BYTES_CUALQUIERA);
    expect(resultado).toEqual({ exitoso: false, razon: 'PDF_INDICE_CIFRADO' });
  });

  it('PDF_INDICE_SIN_CAPA_DE_TEXTO: propaga PdfSinCapaDeTextoError', async () => {
    const adaptador = new ExtractorIndiceMensualRegistroOficialPdfjs(
      async () => {
        throw new PdfSinCapaDeTextoError('sin texto');
      },
    );
    const resultado = await adaptador.extraer(BYTES_CUALQUIERA);
    expect(resultado).toEqual({
      exitoso: false,
      razon: 'PDF_INDICE_SIN_CAPA_DE_TEXTO',
    });
  });

  it('PDF_INDICE_DEMASIADO_GRANDE: propaga PdfDemasiadoGrandeError', async () => {
    const adaptador = new ExtractorIndiceMensualRegistroOficialPdfjs(
      async () => {
        throw new PdfDemasiadoGrandeError('grande');
      },
    );
    const resultado = await adaptador.extraer(BYTES_CUALQUIERA);
    expect(resultado).toEqual({
      exitoso: false,
      razon: 'PDF_INDICE_DEMASIADO_GRANDE',
    });
  });

  it('PDF_INDICE_INVALIDO: propaga PdfInvalidoError (cabecera/estructura/truncado)', async () => {
    const adaptador = new ExtractorIndiceMensualRegistroOficialPdfjs(
      async () => {
        throw new PdfInvalidoError('invalido');
      },
    );
    const resultado = await adaptador.extraer(BYTES_CUALQUIERA);
    expect(resultado).toEqual({ exitoso: false, razon: 'PDF_INDICE_INVALIDO' });
  });

  it('un error no clasificado de leerPdf no se traga silenciosamente: se relanza', async () => {
    const adaptador = new ExtractorIndiceMensualRegistroOficialPdfjs(
      async () => {
        throw new Error('boom inesperado');
      },
    );
    await expect(adaptador.extraer(BYTES_CUALQUIERA)).rejects.toThrow(
      'boom inesperado',
    );
  });

  it('PERIODO_INDICE_NO_DETECTADO: parsearDocumento sin período detectado', async () => {
    const adaptador = new ExtractorIndiceMensualRegistroOficialPdfjs(
      async () => [PAGINA_FALSA],
      () => resultadoParseoSinPeriodo(),
    );
    const resultado = await adaptador.extraer(BYTES_CUALQUIERA);
    expect(resultado).toEqual({
      exitoso: false,
      razon: 'PERIODO_INDICE_NO_DETECTADO',
    });
  });

  it('éxito: ensambla periodoDetectado, totalPaginas y entradasDetectadas desde el payload real', async () => {
    const paginas = [PAGINA_FALSA, PAGINA_FALSA];
    const entradaEsperada = {
      posicion: 0,
      tipo: 'Resolución',
      numero: 'R-1',
      titulo: 'Título',
      institucion: 'Institución',
      seccion: null,
      publicacion: { tipo: 'RO', numero: 1, fecha: '2026-05-04' },
      segmentoCrudo: 'texto',
      metadataExtraccion: {},
      advertencias: [],
      confianza: 1,
    };
    const adaptador = new ExtractorIndiceMensualRegistroOficialPdfjs(
      async () => paginas,
      () => resultadoParseoConPeriodo(),
      (
        resultado: ResultadoParseoDocumento,
        opciones: OpcionesConstruccionPayload,
      ): IngerirResumenHttpDto => ({
        periodo: resultado.periodoDetectado!,
        urlResumenMensualRegistroOficial:
          opciones.urlResumenMensualRegistroOficial,
        versionExtractor: opciones.versionExtractor,
        entradasDetectadas: [entradaEsperada],
      }),
    );

    const resultado = await adaptador.extraer(BYTES_CUALQUIERA);

    expect(resultado).toEqual({
      exitoso: true,
      periodoDetectado: { anio: 2026, mes: 5 },
      totalPaginas: 2,
      entradasDetectadas: [entradaEsperada],
    });
  });

  it('el constructor por defecto usa las funciones reales de Fase 5C (referencia exacta, sin duplicar)', async () => {
    const {
      leerPdf: leerPdfReal,
    } = await import('../../extractor-registro-oficial/adaptador-pdfjs');
    const {
      parsearDocumento: parsearDocumentoReal,
    } = await import('../../extractor-registro-oficial/parser-indice-mensual');
    const {
      construirPayloadIngesta: construirPayloadIngestaReal,
    } = await import('../../extractor-registro-oficial/constructor-payload-ingesta');

    const adaptador = new ExtractorIndiceMensualRegistroOficialPdfjs();
    expect((adaptador as unknown as { leerPdfImpl: unknown }).leerPdfImpl).toBe(
      leerPdfReal,
    );
    expect(
      (adaptador as unknown as { parsearDocumentoImpl: unknown })
        .parsearDocumentoImpl,
    ).toBe(parsearDocumentoReal);
    expect(
      (adaptador as unknown as { construirPayloadIngestaImpl: unknown })
        .construirPayloadIngestaImpl,
    ).toBe(construirPayloadIngestaReal);
  });
});
