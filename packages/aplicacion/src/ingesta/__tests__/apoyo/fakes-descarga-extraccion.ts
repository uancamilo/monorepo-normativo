import {
  DescargadorPdfIndiceRegistroOficial,
  RazonDescargaPdfIndiceFallida,
  ResultadoDescargaPdfIndice,
} from '../../puertos/DescargadorPdfIndiceRegistroOficial';
import {
  ExtractorIndiceMensualRegistroOficial,
  RazonExtraccionIndiceFallida,
  ResultadoExtraccionIndice,
} from '../../puertos/ExtractorIndiceMensualRegistroOficial';
import { crearEntradaDetectada } from './fakes-ingesta';

export class DescargadorPdfIndiceFake
  implements DescargadorPdfIndiceRegistroOficial
{
  /** Observabilidad de pruebas: URLs consultadas, en orden. */
  readonly llamadas: string[] = [];
  private resultado: ResultadoDescargaPdfIndice = {
    exitoso: true,
    bytes: new Uint8Array([1, 2, 3]),
    tamanioBytes: 3,
    sha256Pdf: 'sha-fake-por-defecto',
  };

  configurarExito(bytes: Uint8Array, sha256Pdf: string): void {
    this.resultado = {
      exitoso: true,
      bytes,
      tamanioBytes: bytes.byteLength,
      sha256Pdf,
    };
  }

  configurarFallo(razon: RazonDescargaPdfIndiceFallida): void {
    this.resultado = { exitoso: false, razon };
  }

  async descargar(urlPdf: string): Promise<ResultadoDescargaPdfIndice> {
    this.llamadas.push(urlPdf);
    return this.resultado;
  }
}

export class ExtractorIndiceMensualFake
  implements ExtractorIndiceMensualRegistroOficial
{
  readonly versionExtractor: string;
  /** Observabilidad de pruebas: número de invocaciones a extraer(). */
  llamadas = 0;
  private resultado: ResultadoExtraccionIndice = {
    exitoso: true,
    periodoDetectado: { anio: 2026, mes: 5 },
    totalPaginas: 1,
    entradasDetectadas: [crearEntradaDetectada()],
  };

  constructor(versionExtractor = 'indice-mensual-v1') {
    this.versionExtractor = versionExtractor;
  }

  configurarExito(
    periodoDetectado = { anio: 2026, mes: 5 },
    entradasDetectadas = [crearEntradaDetectada()],
    totalPaginas = 1,
  ): void {
    this.resultado = {
      exitoso: true,
      periodoDetectado,
      totalPaginas,
      entradasDetectadas,
    };
  }

  configurarFallo(razon: RazonExtraccionIndiceFallida): void {
    this.resultado = { exitoso: false, razon };
  }

  async extraer(): Promise<ResultadoExtraccionIndice> {
    this.llamadas += 1;
    return this.resultado;
  }
}
