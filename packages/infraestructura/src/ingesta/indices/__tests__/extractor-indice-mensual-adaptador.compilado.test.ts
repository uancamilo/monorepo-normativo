import { expect, it, beforeAll } from '@jest/globals';
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Ejercicio del adaptador real (funciones por defecto, sin dobles) contra el
 * fixture PDF real de mayo de 2026, requiere el `import()` dinámico genuino
 * de `leerPdf` (pdfjs-dist es ESM-only). El sandbox VM de Jest no lo soporta
 * sin `--experimental-vm-modules` global (ver adaptador-pdfjs.ts y
 * cli.test.ts): se ejecuta el binario ya compilado como proceso hijo de un
 * solo uso, mismo patrón exacto que `cli.test.ts`/`extractor-integral.test.ts`.
 * Esta suite nunca compila por sí misma (mismo motivo documentado en esos
 * archivos): falla con un mensaje claro si `dist` no existe.
 */
const ADAPTADOR_COMPILADO = resolve(
  __dirname,
  '../../../../dist/ingesta/indices/extractor-indice-mensual-adaptador.js',
);
const PDF_FIXTURE_REAL = resolve(
  __dirname,
  '../../extractor-registro-oficial/__tests__/fixtures/indice-mensual-registro-oficial-2026-05.pdf',
);

beforeAll(() => {
  if (!existsSync(ADAPTADOR_COMPILADO)) {
    throw new Error(
      `No existe el adaptador compilado en ${ADAPTADOR_COMPILADO}. Compila ` +
        'antes de probar desde la raíz con "npm test" o ' +
        '"npm run test:infraestructura".',
    );
  }
});

it('extrae el fixture real de mayo de 2026 con las funciones reales (import() dinámico genuino, fuera del sandbox de Jest)', () => {
  const script = `
    const { readFileSync } = require('fs');
    const { ExtractorIndiceMensualRegistroOficialPdfjs } = require(${JSON.stringify(
      ADAPTADOR_COMPILADO,
    )});
    const bytes = new Uint8Array(readFileSync(${JSON.stringify(PDF_FIXTURE_REAL)}));
    const adaptador = new ExtractorIndiceMensualRegistroOficialPdfjs();
    adaptador.extraer(bytes).then((resultado) => {
      process.stdout.write(JSON.stringify({
        exitoso: resultado.exitoso,
        periodoDetectado: resultado.exitoso ? resultado.periodoDetectado : null,
        totalPaginas: resultado.exitoso ? resultado.totalPaginas : null,
        totalEntradas: resultado.exitoso ? resultado.entradasDetectadas.length : null,
        primeraPosicion: resultado.exitoso ? resultado.entradasDetectadas[0].posicion : null,
        ultimaPosicion: resultado.exitoso ? resultado.entradasDetectadas[resultado.entradasDetectadas.length - 1].posicion : null,
        versionExtractor: adaptador.versionExtractor,
      }));
    }).catch((error) => {
      process.stderr.write(String((error && error.stack) || error));
      process.exitCode = 1;
    });
  `;

  const stdout = execFileSync('node', ['-e', script], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const resultado = JSON.parse(stdout) as {
    exitoso: boolean;
    periodoDetectado: { anio: number; mes: number } | null;
    totalPaginas: number | null;
    totalEntradas: number | null;
    primeraPosicion: number | null;
    ultimaPosicion: number | null;
    versionExtractor: string;
  };

  expect(resultado.exitoso).toBe(true);
  expect(resultado.periodoDetectado).toEqual({ anio: 2026, mes: 5 });
  expect(resultado.totalPaginas).toBe(53);
  expect(resultado.totalEntradas).toBe(869);
  expect(resultado.primeraPosicion).toBe(0);
  expect(resultado.ultimaPosicion).toBe(868);
  expect(resultado.versionExtractor).toBe('indice-mensual-v1');
}, 60000);
