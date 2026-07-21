import { EntradaDetectadaResumen } from '../modelos/IngestaRegistroOficial';

export type ContenidoLoteParaHuella = {
  periodo: { anio: number; mes: number };
  urlResumenMensualRegistroOficial: string;
  versionExtractor: string;
  entradasDetectadas: EntradaDetectadaResumen[];
};

/**
 * Calcula una huella estable del contenido de un lote de ingesta, para la
 * idempotencia por (período mensual, huellaLote). Es un servicio puro: la huella
 * no depende del orden de claves de los objetos ni del orden de llegada de
 * las entradas (se ordenan por posición).
 *
 * Usa FNV-1a de 64 bits con dos semillas (128 bits en hex). No es un hash
 * criptográfico ni necesita serlo: solo detecta cambios de contenido.
 */
export class CalculadoraHuellaLote {
  calcular(contenido: ContenidoLoteParaHuella): string {
    const canonico = serializarCanonico({
      periodo: contenido.periodo,
      urlResumenMensualRegistroOficial:
        contenido.urlResumenMensualRegistroOficial,
      versionExtractor: contenido.versionExtractor,
      entradasDetectadas: [...contenido.entradasDetectadas].sort(
        (a, b) => a.posicion - b.posicion,
      ),
    });

    return (
      fnv1a64(canonico, SEMILLA_PRIMARIA) + fnv1a64(canonico, SEMILLA_SECUNDARIA)
    );
  }
}

const SEMILLA_PRIMARIA = 0xcbf29ce484222325n;
const SEMILLA_SECUNDARIA = 0xaf63bd4c8601b7dfn;
const PRIMO_FNV_64 = 0x100000001b3n;
const MASCARA_64_BITS = 0xffffffffffffffffn;

function fnv1a64(texto: string, semilla: bigint): string {
  let hash = semilla;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= BigInt(texto.charCodeAt(i));
    hash = (hash * PRIMO_FNV_64) & MASCARA_64_BITS;
  }
  return hash.toString(16).padStart(16, '0');
}

/** JSON determinístico: claves de objeto ordenadas en todos los niveles. */
function serializarCanonico(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') {
    return JSON.stringify(valor) ?? 'null';
  }

  if (Array.isArray(valor)) {
    return `[${valor.map(serializarCanonico).join(',')}]`;
  }

  const claves = Object.keys(valor as Record<string, unknown>).sort();
  const entradas = claves.map(
    (clave) =>
      `${JSON.stringify(clave)}:${serializarCanonico(
        (valor as Record<string, unknown>)[clave],
      )}`,
  );
  return `{${entradas.join(',')}}`;
}
