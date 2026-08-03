/**
 * CLI standalone del extractor del índice mensual del Registro Oficial.
 * Proceso externo al backend NestJS: lee un PDF local, valida el período,
 * genera el JSON del contrato de ingesta y lo escribe en disco. No accede a
 * red, no llama al backend, no escribe en PostgreSQL.
 */

import { readFileSync, statSync, writeFileSync } from 'fs';
import {
  PdfCifradoError,
  PdfDemasiadoGrandeError,
  PdfInvalidoError,
  PdfSinCapaDeTextoError,
  LIMITE_TAMANIO_BYTES,
  leerPdf,
} from './adaptador-pdfjs';
import { parsearDocumento } from './parser-indice-mensual';
import {
  PeriodoNoDetectadoError,
  construirPayloadIngesta,
} from './constructor-payload-ingesta';

const TEXTO_AYUDA = `Extractor del índice mensual del Registro Oficial (Fase 5C).

Uso:
  extraer-registro-oficial --pdf <ruta> --periodo <AAAA-MM> --url <url> \\
    --version-extractor <version> --salida <ruta-json> [--mostrar-json]

Opciones obligatorias:
  --pdf <ruta>               Ruta local del PDF del índice mensual.
  --periodo <AAAA-MM>        Período esperado (año-mes), p.ej. 2026-05.
  --url <url>                URL del resumen mensual del Registro Oficial
                              (se incluye en el payload, no se descarga).
  --version-extractor <ver>  Versión del extractor a registrar en el payload.
  --salida <ruta-json>       Ruta donde escribir el JSON generado.

Opciones adicionales:
  --mostrar-json              Imprime el JSON generado por stdout.
  -h, --help                  Muestra esta ayuda.

Este CLI no descarga el PDF por URL, no envía el resultado al backend, no
accede a PostgreSQL y no requiere conexión de red.
`;

export interface ArgumentosCli {
  pdf: string;
  periodo: { anio: number; mes: number };
  url: string;
  versionExtractor: string;
  salida: string;
  mostrarJson: boolean;
}

export class ArgumentosInvalidosError extends Error {}

function parsearPeriodo(texto: string): { anio: number; mes: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(texto);
  if (!match) {
    throw new ArgumentosInvalidosError(
      `--periodo inválido: "${texto}" (formato esperado AAAA-MM).`,
    );
  }
  const anio = Number(match[1]);
  const mes = Number(match[2]);
  if (anio < 1900 || anio > 2100) {
    throw new ArgumentosInvalidosError(
      `--periodo inválido: "${texto}" (el año debe estar entre 1900 y 2100).`,
    );
  }
  if (mes < 1 || mes > 12) {
    throw new ArgumentosInvalidosError(
      `--periodo inválido: "${texto}" (el mes debe estar entre 01 y 12).`,
    );
  }
  return { anio, mes };
}

export function parsearArgumentos(argv: string[]): ArgumentosCli | 'AYUDA' {
  if (argv.includes('--help') || argv.includes('-h')) {
    return 'AYUDA';
  }

  const valores = new Map<string, string>();
  let mostrarJson = false;
  const opcionesConValor = new Set([
    'pdf',
    'periodo',
    'url',
    'version-extractor',
    'salida',
  ]);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--mostrar-json') {
      if (mostrarJson) {
        throw new ArgumentosInvalidosError(
          'La opción --mostrar-json no puede repetirse.',
        );
      }
      mostrarJson = true;
      continue;
    }
    if (!arg.startsWith('--')) {
      throw new ArgumentosInvalidosError(`Argumento no reconocido: "${arg}".`);
    }
    const clave = arg.slice(2);
    if (!opcionesConValor.has(clave)) {
      throw new ArgumentosInvalidosError(`Argumento no reconocido: "${arg}".`);
    }
    if (valores.has(clave)) {
      throw new ArgumentosInvalidosError(
        `La opción --${clave} no puede repetirse.`,
      );
    }
    const valor = argv[i + 1];
    if (valor === undefined || valor.startsWith('--')) {
      throw new ArgumentosInvalidosError(`Falta el valor de --${clave}.`);
    }
    valores.set(clave, valor);
    i++;
  }

  const requeridos = ['pdf', 'periodo', 'url', 'version-extractor', 'salida'];
  const faltantes = requeridos.filter((clave) => !valores.has(clave));
  if (faltantes.length > 0) {
    throw new ArgumentosInvalidosError(
      `Faltan argumentos obligatorios: ${faltantes.map((c) => `--${c}`).join(', ')}.`,
    );
  }

  for (const clave of requeridos) {
    if (valores.get(clave)!.trim().length === 0) {
      throw new ArgumentosInvalidosError(`El valor de --${clave} no puede estar vacío.`);
    }
  }

  const url = valores.get('url')!.trim();
  try {
    new URL(url);
  } catch {
    throw new ArgumentosInvalidosError(`--url inválida: "${url}".`);
  }

  return {
    pdf: valores.get('pdf')!,
    periodo: parsearPeriodo(valores.get('periodo')!),
    url,
    versionExtractor: valores.get('version-extractor')!.trim(),
    salida: valores.get('salida')!,
    mostrarJson,
  };
}

type LectorArchivoBinario = (ruta: string) => Buffer;

export function leerBytesPdfLocal(
  ruta: string,
  leerArchivo: LectorArchivoBinario = (rutaArchivo) => readFileSync(rutaArchivo),
): Uint8Array {
  let info;
  try {
    info = statSync(ruta);
  } catch {
    throw new ArgumentosInvalidosError(`No existe el archivo indicado en --pdf: "${ruta}".`);
  }
  if (!info.isFile()) {
    throw new ArgumentosInvalidosError(`--pdf no apunta a un archivo: "${ruta}".`);
  }
  if (info.size > LIMITE_TAMANIO_BYTES) {
    throw new PdfDemasiadoGrandeError(
      `El PDF supera el límite de tamaño permitido (${LIMITE_TAMANIO_BYTES} bytes).`,
    );
  }
  return new Uint8Array(leerArchivo(ruta));
}

export async function ejecutarCli(
  argv: string[],
  salidaEstandar: (texto: string) => void = console.log,
  salidaError: (texto: string) => void = console.error,
): Promise<number> {
  let argumentos: ArgumentosCli | 'AYUDA';
  try {
    argumentos = parsearArgumentos(argv);
  } catch (error) {
    salidaError(error instanceof Error ? error.message : String(error));
    salidaError('Use --help para ver el uso.');
    return 2;
  }

  if (argumentos === 'AYUDA') {
    salidaEstandar(TEXTO_AYUDA);
    return 0;
  }

  let bytes: Uint8Array;
  try {
    bytes = leerBytesPdfLocal(argumentos.pdf);
  } catch (error) {
    salidaError(error instanceof Error ? error.message : String(error));
    return error instanceof PdfDemasiadoGrandeError ? 4 : 2;
  }

  try {
    const paginas = await leerPdf(bytes);
    const resultado = parsearDocumento(paginas);

    if (
      resultado.periodoDetectado === null ||
      resultado.periodoDetectado.anio !== argumentos.periodo.anio ||
      resultado.periodoDetectado.mes !== argumentos.periodo.mes
    ) {
      salidaError(
        `El período detectado en el PDF (${JSON.stringify(
          resultado.periodoDetectado,
        )}) no coincide con el período esperado (${argumentos.periodo.anio}-${String(
          argumentos.periodo.mes,
        ).padStart(2, '0')}).`,
      );
      return 3;
    }

    const payload = construirPayloadIngesta(resultado, {
      urlResumenMensualRegistroOficial: argumentos.url,
      versionExtractor: argumentos.versionExtractor,
    });

    const json = `${JSON.stringify(payload, null, 2)}\n`;
    writeFileSync(argumentos.salida, json, { encoding: 'utf-8' });

    if (argumentos.mostrarJson) {
      salidaEstandar(json);
    } else {
      salidaEstandar(
        `OK: ${payload.entradasDetectadas.length} entradas escritas en ${argumentos.salida}`,
      );
    }
    return 0;
  } catch (error) {
    if (
      error instanceof PdfCifradoError ||
      error instanceof PdfSinCapaDeTextoError ||
      error instanceof PdfInvalidoError ||
      error instanceof PdfDemasiadoGrandeError ||
      error instanceof PeriodoNoDetectadoError
    ) {
      salidaError(error.message);
      return 4;
    }
    salidaError(
      `Error inesperado: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
}

/* eslint-disable @typescript-eslint/no-floating-promises */
if (require.main === module) {
  ejecutarCli(process.argv.slice(2)).then((codigo) => {
    process.exitCode = codigo;
  });
}
