import { execFileSync } from 'child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import {
  ArgumentosInvalidosError,
  ejecutarCli,
  leerBytesPdfLocal,
  parsearArgumentos,
} from '../cli';
import { PdfDemasiadoGrandeError } from '../adaptador-pdfjs';
import { construirPdfSinTexto } from './apoyo/generar-pdf-minimo';

const CLI_COMPILADO = resolve(
  __dirname,
  '../../../../dist/ingesta/extractor-registro-oficial/cli.js',
);
const PDF_FIXTURE_REAL = resolve(
  __dirname,
  'fixtures/indice-mensual-registro-oficial-2026-05.pdf',
);
const URL_FIXTURE =
  'https://esacc.corteconstitucional.gob.ec/storage/api/v1/10_DWL_FL/eyJjYXJwZXRhIjoicm8iLCJ1dWlkIjoiZWVmMDQ0ZjAtZWVlNy00NGQ4LTljNTUtZjI2MmRkYzJjYWU1LnBkZiJ9';

/**
 * Las pruebas que llaman a `leerPdf` sobre un PDF real requieren un
 * `import()` dinámico genuino (`pdfjs-dist` es ESM-only). El sandbox VM de
 * Jest no soporta `import()` dinámico sin `--experimental-vm-modules`
 * global; en vez de activar esa bandera para toda la suite, esas pruebas
 * ejecutan el CLI ya compilado como proceso hijo de un solo uso (no un
 * proceso persistente): así se prueba el binario real, como lo ejecutaría
 * un usuario. Las pruebas que fallan antes de tocar el PDF (ayuda,
 * argumentos, PDF inexistente/inválido/demasiado grande) no necesitan
 * proceso alguno: se llaman directamente.
 */
function ejecutarCliCompilado(
  args: string[],
): { codigo: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', [CLI_COMPILADO, ...args], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { codigo: 0, stdout, stderr: '' };
  } catch (error) {
    const err = error as { status: number; stdout: string; stderr: string };
    return { codigo: err.status, stdout: err.stdout, stderr: err.stderr };
  }
}

// Esta suite nunca compila por sí misma: decidir si compilar aquí abría la
// puerta a que dos archivos de test disparen builds completos concurrentes
// (~150s) y a que una suite valide un `dist` obsoleto si ya existía. El
// build está orquestado una sola vez, fuera de los workers de Jest, por los
// comandos públicos de la raíz (`npm test`, `npm run test:infraestructura`
// o `npm run test:extractor`). Si falta, se falla aquí con un mensaje claro
// en vez de intentar resolverlo silenciosamente.
beforeAll(() => {
  if (!existsSync(CLI_COMPILADO)) {
    throw new Error(
      `No existe el CLI compilado en ${CLI_COMPILADO}. Compila antes de ` +
        'probar desde la raíz con "npm test", ' +
        '"npm run test:infraestructura" o "npm run test:extractor".',
    );
  }
});

describe('parsearArgumentos', () => {
  it('reconoce --help', () => {
    expect(parsearArgumentos(['--help'])).toBe('AYUDA');
    expect(parsearArgumentos(['-h'])).toBe('AYUDA');
  });

  it('rechaza cuando faltan argumentos obligatorios', () => {
    expect(() => parsearArgumentos([])).toThrow(ArgumentosInvalidosError);
    expect(() => parsearArgumentos(['--pdf', 'x.pdf'])).toThrow(
      ArgumentosInvalidosError,
    );
  });

  it('rechaza un --periodo con formato inválido', () => {
    expect(() =>
      parsearArgumentos([
        '--pdf', 'x.pdf',
        '--periodo', '2026-5',
        '--url', 'https://example.org',
        '--version-extractor', 'v1',
        '--salida', 'out.json',
      ]),
    ).toThrow(ArgumentosInvalidosError);
  });

  it('parsea argumentos válidos', () => {
    const args = parsearArgumentos([
      '--pdf', 'x.pdf',
      '--periodo', '2026-05',
      '--url', 'https://example.org',
      '--version-extractor', 'v1',
      '--salida', 'out.json',
      '--mostrar-json',
    ]);
    expect(args).not.toBe('AYUDA');
    if (args === 'AYUDA') throw new Error('inesperado');
    expect(args.periodo).toEqual({ anio: 2026, mes: 5 });
    expect(args.mostrarJson).toBe(true);
  });

  it('rechaza opciones desconocidas en vez de ignorarlas', () => {
    expect(() =>
      parsearArgumentos([
        '--pdf', 'x.pdf',
        '--periodo', '2026-05',
        '--url', 'https://example.org',
        '--version-extractor', 'v1',
        '--salida', 'out.json',
        '--opcion-desconocida', 'valor',
      ]),
    ).toThrow(ArgumentosInvalidosError);
  });

  it('rechaza una opción repetida en vez de conservar silenciosamente la última', () => {
    expect(() =>
      parsearArgumentos([
        '--pdf', 'x.pdf',
        '--periodo', '2026-05',
        '--url', 'https://example.org',
        '--version-extractor', 'v1',
        '--salida', 'out.json',
        '--periodo', '2026-06',
      ]),
    ).toThrow(ArgumentosInvalidosError);
  });

  it.each([
    ['URL inválida', ['--url', 'no-es-url']],
    ['URL vacía', ['--url', '']],
    ['versión vacía', ['--version-extractor', '   ']],
    ['ruta PDF vacía', ['--pdf', '']],
    ['ruta de salida vacía', ['--salida', '']],
  ])('rechaza %s para no generar un payload que la ingesta descartará', (_caso, reemplazo) => {
    const argumentos = [
      '--pdf', 'x.pdf',
      '--periodo', '2026-05',
      '--url', 'https://example.org',
      '--version-extractor', 'v1',
      '--salida', 'out.json',
    ];
    const indice = argumentos.indexOf(reemplazo[0]);
    argumentos[indice + 1] = reemplazo[1];
    expect(() => parsearArgumentos(argumentos)).toThrow(
      ArgumentosInvalidosError,
    );
  });

  it.each(['1899-12', '2101-01'])(
    'rechaza el período %s fuera del rango aceptado por la ingesta',
    (periodo) => {
      expect(() =>
        parsearArgumentos([
          '--pdf', 'x.pdf',
          '--periodo', periodo,
          '--url', 'https://example.org',
          '--version-extractor', 'v1',
          '--salida', 'out.json',
        ]),
      ).toThrow(ArgumentosInvalidosError);
    },
  );
});

describe('ejecutarCli — rutas que no requieren leer un PDF real', () => {
  it('muestra la ayuda con --help y retorna código 0', async () => {
    const salidas: string[] = [];
    const codigo = await ejecutarCli(['--help'], (t) => salidas.push(t));
    expect(codigo).toBe(0);
    expect(salidas.join('\n')).toContain('Uso:');
  });

  it('retorna código distinto de cero si faltan argumentos', async () => {
    const errores: string[] = [];
    const codigo = await ejecutarCli([], () => {}, (t) => errores.push(t));
    expect(codigo).not.toBe(0);
    expect(errores.join('\n')).toContain('Faltan argumentos');
  });

  it('retorna código distinto de cero si el PDF no existe', async () => {
    const errores: string[] = [];
    const codigo = await ejecutarCli(
      [
        '--pdf', '/ruta/inexistente.pdf',
        '--periodo', '2026-05',
        '--url', 'https://example.org',
        '--version-extractor', 'v1',
        '--salida', '/tmp/salida-inexistente.json',
      ],
      () => {},
      (t) => errores.push(t),
    );
    expect(codigo).not.toBe(0);
    expect(errores.join('\n')).toContain('No existe el archivo');
  });

  it('retorna código distinto de cero si el archivo no es un PDF válido', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fase5c-cli-'));
    const rutaNoPdf = join(dir, 'no-es-pdf.txt');
    writeFileSync(rutaNoPdf, 'esto no es un PDF');
    const salidaJson = join(dir, 'salida.json');

    const errores: string[] = [];
    const codigo = await ejecutarCli(
      [
        '--pdf', rutaNoPdf,
        '--periodo', '2026-05',
        '--url', 'https://example.org',
        '--version-extractor', 'v1',
        '--salida', salidaJson,
      ],
      () => {},
      (t) => errores.push(t),
    );
    expect(codigo).not.toBe(0);
    expect(errores.join('\n')).toContain('%PDF-');
    expect(existsSync(salidaJson)).toBe(false);

    rmSync(dir, { recursive: true, force: true });
  });

  it('retorna código distinto de cero si el PDF supera el límite de tamaño', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fase5c-cli-'));
    const rutaGrande = join(dir, 'grande.pdf');
    writeFileSync(rutaGrande, '%PDF-1.4\n');
    truncateSync(rutaGrande, 50 * 1024 * 1024 + 1);
    const salidaJson = join(dir, 'salida.json');

    const lectura = jest.fn(() => Buffer.from('%PDF-1.4\n'));
    expect(() => leerBytesPdfLocal(rutaGrande, lectura)).toThrow(
      PdfDemasiadoGrandeError,
    );
    expect(lectura).not.toHaveBeenCalled();

    const errores: string[] = [];
    const codigo = await ejecutarCli(
      [
        '--pdf', rutaGrande,
        '--periodo', '2026-05',
        '--url', 'https://example.org',
        '--version-extractor', 'v1',
        '--salida', salidaJson,
      ],
      () => {},
      (t) => errores.push(t),
    );
    expect(codigo).not.toBe(0);
    expect(errores.join('\n')).toContain('límite de tamaño');
    expect(existsSync(salidaJson)).toBe(false);

    rmSync(dir, { recursive: true, force: true });
  }, 20000);
});

describe('CLI compilado (proceso hijo de un solo uso) — rutas que sí requieren leer un PDF real', () => {
  it('rechaza un PDF real sin capa de texto extraíble', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fase5c-cli-'));
    const rutaPdf = join(dir, 'sin-texto.pdf');
    writeFileSync(rutaPdf, construirPdfSinTexto());
    const salidaJson = join(dir, 'salida.json');

    const { codigo, stderr } = ejecutarCliCompilado([
      '--pdf', rutaPdf,
      '--periodo', '2026-05',
      '--url', 'https://example.org',
      '--version-extractor', 'v1',
      '--salida', salidaJson,
    ]);
    expect(codigo).not.toBe(0);
    expect(stderr).toContain('no tiene capa de texto extraíble');
    expect(existsSync(salidaJson)).toBe(false);

    rmSync(dir, { recursive: true, force: true });
  }, 20000);

  it('procesa el PDF real y escribe el JSON esperado en la ruta indicada', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fase5c-cli-'));
    const salidaJson = join(dir, 'salida.json');

    const { codigo, stdout } = ejecutarCliCompilado([
      '--pdf', PDF_FIXTURE_REAL,
      '--periodo', '2026-05',
      '--url', URL_FIXTURE,
      '--version-extractor', '5c-test',
      '--salida', salidaJson,
    ]);
    expect(codigo).toBe(0);
    expect(stdout).toContain('869 entradas');
    expect(existsSync(salidaJson)).toBe(true);

    const payload = JSON.parse(readFileSync(salidaJson, 'utf-8'));
    expect(payload.periodo).toEqual({ anio: 2026, mes: 5 });
    expect(payload.entradasDetectadas).toHaveLength(869);
    expect(stdout).not.toContain('entradasDetectadas');

    rmSync(dir, { recursive: true, force: true });
  }, 30000);

  it('rechaza el PDF real si el período esperado no coincide con el detectado', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fase5c-cli-'));
    const salidaJson = join(dir, 'salida.json');

    const { codigo, stderr } = ejecutarCliCompilado([
      '--pdf', PDF_FIXTURE_REAL,
      '--periodo', '2026-06',
      '--url', URL_FIXTURE,
      '--version-extractor', '5c-test',
      '--salida', salidaJson,
    ]);
    expect(codigo).not.toBe(0);
    expect(stderr).toContain('no coincide');
    expect(existsSync(salidaJson)).toBe(false);

    rmSync(dir, { recursive: true, force: true });
  }, 30000);
});
