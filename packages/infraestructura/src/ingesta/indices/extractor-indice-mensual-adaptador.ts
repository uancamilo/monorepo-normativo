import type { ExtractorIndiceMensualRegistroOficial as PuertoExtractorIndiceMensual } from '@normativo/aplicacion';
import type { ResultadoExtraccionIndice } from '@normativo/aplicacion';
import {
  leerPdf,
  PdfCifradoError,
  PdfDemasiadoGrandeError,
  PdfInvalidoError,
  PdfSinCapaDeTextoError,
} from '../extractor-registro-oficial/adaptador-pdfjs';
import { parsearDocumento } from '../extractor-registro-oficial/parser-indice-mensual';
import {
  construirPayloadIngesta,
  PeriodoNoDetectadoError,
} from '../extractor-registro-oficial/constructor-payload-ingesta';

/**
 * Versión estable del extractor de índices mensuales (Fase 5D). Única fuente
 * de verdad: nunca un timestamp, fecha de build, commit Git ni la versión
 * general del monorepo. Cambia únicamente cuando cambia deliberadamente la
 * semántica de extracción — nunca con cada build. `Analizar` la lee de aquí
 * para devolverla en la previsualización; `Confirmar` la lee de aquí para
 * compararla contra `versionExtractorObservada` antes de descargar.
 */
export const VERSION_EXTRACTOR_INDICE_MENSUAL_ACTUAL = 'indice-mensual-v1';

type LeerPdfFn = typeof leerPdf;
type ParsearDocumentoFn = typeof parsearDocumento;
type ConstruirPayloadIngestaFn = typeof construirPayloadIngesta;

/**
 * Adaptador de infraestructura del puerto `ExtractorIndiceMensualRegistroOficial`
 * (Fase 5D). Envuelve, sin modificarlas, las tres funciones puras ya
 * certificadas de Fase 5C (`leerPdf`, `parsearDocumento`,
 * `construirPayloadIngesta`) y traduce sus excepciones tipadas a un resultado
 * discriminado — nunca deja escapar una excepción de PDF.js hacia el caso de
 * uso. No conoce filesystem, `fetch` ni NestJS.
 *
 * Las tres dependencias son inyectables (mismo patrón que `fetchImpl` en
 * `CatalogoRegistroOficialHttp`) para permitir probar la lógica propia del
 * adaptador sin PDF.js real: `leerPdf` requiere un `import()` dinámico
 * genuino que el sandbox VM de Jest no soporta sin `--experimental-vm-modules`
 * (ver comentario de cabecera de `adaptador-pdfjs.ts`). El ejercicio contra
 * el fixture PDF real vive en un test aparte que corre el binario ya
 * compilado como proceso hijo, mismo patrón que `cli.test.ts`.
 */
export class ExtractorIndiceMensualRegistroOficialPdfjs
  implements PuertoExtractorIndiceMensual
{
  readonly versionExtractor = VERSION_EXTRACTOR_INDICE_MENSUAL_ACTUAL;

  constructor(
    private readonly leerPdfImpl: LeerPdfFn = leerPdf,
    private readonly parsearDocumentoImpl: ParsearDocumentoFn = parsearDocumento,
    private readonly construirPayloadIngestaImpl: ConstruirPayloadIngestaFn = construirPayloadIngesta,
  ) {}

  async extraer(bytes: Uint8Array): Promise<ResultadoExtraccionIndice> {
    let paginas;
    try {
      paginas = await this.leerPdfImpl(bytes);
    } catch (error) {
      if (error instanceof PdfCifradoError) {
        return { exitoso: false, razon: 'PDF_INDICE_CIFRADO' };
      }
      if (error instanceof PdfSinCapaDeTextoError) {
        return { exitoso: false, razon: 'PDF_INDICE_SIN_CAPA_DE_TEXTO' };
      }
      if (error instanceof PdfDemasiadoGrandeError) {
        return { exitoso: false, razon: 'PDF_INDICE_DEMASIADO_GRANDE' };
      }
      if (error instanceof PdfInvalidoError) {
        return { exitoso: false, razon: 'PDF_INDICE_INVALIDO' };
      }
      throw error;
    }

    const resultado = this.parsearDocumentoImpl(paginas);

    let payload;
    try {
      payload = this.construirPayloadIngestaImpl(resultado, {
        // Descartado por el adaptador: el puerto no expone esta URL (la
        // conocen los casos de uso, que la reciben en su propia solicitud).
        urlResumenMensualRegistroOficial: '',
        versionExtractor: this.versionExtractor,
      });
    } catch (error) {
      if (error instanceof PeriodoNoDetectadoError) {
        return { exitoso: false, razon: 'PERIODO_INDICE_NO_DETECTADO' };
      }
      throw error;
    }

    return {
      exitoso: true,
      periodoDetectado: payload.periodo,
      totalPaginas: paginas.length,
      entradasDetectadas: payload.entradasDetectadas.map((entrada) => ({
        posicion: entrada.posicion,
        tipo: entrada.tipo,
        numero: entrada.numero,
        titulo: entrada.titulo,
        institucion: entrada.institucion,
        seccion: entrada.seccion,
        publicacion: entrada.publicacion,
        segmentoCrudo: entrada.segmentoCrudo,
        metadataExtraccion: entrada.metadataExtraccion,
        advertencias: entrada.advertencias,
        confianza: entrada.confianza,
      })),
    };
  }
}
