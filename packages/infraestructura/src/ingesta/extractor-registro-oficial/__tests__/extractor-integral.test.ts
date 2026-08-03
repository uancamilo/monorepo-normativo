import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

/**
 * Prueba integral offline contra el PDF piloto real (índice mensual del
 * Registro Oficial, mayo de 2026), fijado como fixture canónico del
 * repositorio. No depende de red: el PDF ya está en el repositorio.
 *
 * Ejecuta el CLI ya compilado como proceso de un solo uso (no persistente)
 * dos veces —una para las aserciones de contenido, otra para comprobar
 * determinismo byte a byte— por la misma razón documentada en
 * `cli.test.ts`: `leerPdf` requiere un `import()` dinámico real que el
 * sandbox VM de Jest no soporta sin `--experimental-vm-modules` global.
 *
 * Los números exactos verificados aquí (869 entradas, 870 referencias,
 * distribución por tipo, etc.) provienen del análisis manual del PDF piloto
 * documentado en la Fase 5C, no de ajustar el test al resultado del código.
 */

const CLI_COMPILADO = resolve(
  __dirname,
  '../../../../dist/ingesta/extractor-registro-oficial/cli.js',
);
const ADAPTADOR_COMPILADO = resolve(
  __dirname,
  '../../../../dist/ingesta/extractor-registro-oficial/adaptador-pdfjs.js',
);
const PARSER_COMPILADO = resolve(
  __dirname,
  '../../../../dist/ingesta/extractor-registro-oficial/parser-indice-mensual.js',
);
const PDF_FIXTURE = resolve(
  __dirname,
  'fixtures/indice-mensual-registro-oficial-2026-05.pdf',
);
const URL_FIXTURE =
  'https://esacc.corteconstitucional.gob.ec/storage/api/v1/10_DWL_FL/eyJjYXJwZXRhIjoicm8iLCJ1dWlkIjoiZWVmMDQ0ZjAtZWVlNy00NGQ4LTljNTUtZjI2MmRkYzJjYWU1LnBkZiJ9';
const SHA256_ESPERADO =
  '60187abe757ea62b76aecad357d96689be2704bcb5d2f7344bbba553361a705e';
const TAMANIO_ESPERADO_BYTES = 1071024;

interface EntradaHttp {
  posicion: number;
  tipo: string | null;
  numero: string | null;
  titulo: string | null;
  institucion: string | null;
  seccion: string | null;
  publicacion: { tipo: string | null; numero: number | null; fecha: string | null } | null;
  segmentoCrudo: string;
  metadataExtraccion: Record<string, unknown>;
  advertencias: string[];
  confianza: number;
}

interface PayloadHttp {
  periodo: { anio: number; mes: number };
  urlResumenMensualRegistroOficial: string;
  versionExtractor: string;
  entradasDetectadas: EntradaHttp[];
}

let dirTemporal: string;
let payload: PayloadHttp;
let numeroDePaginas: number;
let entradasPorPagina: number[];

// Igual que en `cli.test.ts`: esta suite nunca decide compilar. El build
// está orquestado una sola vez, fuera de los workers de Jest, por los
// comandos públicos de la raíz (`npm test`, `npm run test:infraestructura`
// o `npm run test:extractor`).
beforeAll(() => {
  if (!existsSync(CLI_COMPILADO)) {
    throw new Error(
      `No existe el CLI compilado en ${CLI_COMPILADO}. Compila antes de ` +
        'probar desde la raíz con "npm test", ' +
        '"npm run test:infraestructura" o "npm run test:extractor".',
    );
  }

  dirTemporal = mkdtempSync(join(tmpdir(), 'fase5c-integral-'));
  const salidaJson = join(dirTemporal, 'salida-1.json');
  execFileSync('node', [
    CLI_COMPILADO,
    '--pdf', PDF_FIXTURE,
    '--periodo', '2026-05',
    '--url', URL_FIXTURE,
    '--version-extractor', '5c-integral-test',
    '--salida', salidaJson,
  ]);
  payload = JSON.parse(readFileSync(salidaJson, 'utf-8'));

  // Proceso hijo de un solo uso, independiente del CLI, que reporta el
  // número de páginas y las entradas detectadas por página: ninguno de los
  // dos dato viaja en el payload del CLI (el contrato de ingesta no asocia
  // entradas a números de página), pero son necesarios para verificar la
  // estructura física del documento (53 páginas; contenido legal en
  // 1-52; página 53 es contraportada sin entradas).
  const script =
    "const{leerPdf}=require(process.argv[1]);" +
    "const{parsearPagina}=require(process.argv[2]);" +
    "const{readFileSync}=require('fs');" +
    "leerPdf(new Uint8Array(readFileSync(process.argv[3])))" +
    ".then(ps=>console.log(JSON.stringify({" +
    "numPages:ps.length," +
    "entradasPorPagina:ps.map(p=>parsearPagina(p).entradas.length)" +
    "})))" +
    ".catch(e=>{console.error(e);process.exit(1)});";
  const salida = execFileSync(
    'node',
    ['-e', script, ADAPTADOR_COMPILADO, PARSER_COMPILADO, PDF_FIXTURE],
    { encoding: 'utf-8' },
  );
  const resumenPorPagina = JSON.parse(salida);
  numeroDePaginas = resumenPorPagina.numPages;
  entradasPorPagina = resumenPorPagina.entradasPorPagina;
}, 60000);

afterAll(() => {
  if (dirTemporal) rmSync(dirTemporal, { recursive: true, force: true });
});

describe('fixture integral: índice mensual mayo 2026 (PDF real, offline)', () => {
  it('el PDF del repositorio coincide en SHA-256 y tamaño con el fixture piloto verificado', () => {
    const bytes = readFileSync(PDF_FIXTURE);
    expect(bytes.byteLength).toBe(TAMANIO_ESPERADO_BYTES);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(SHA256_ESPERADO);
  });

  it('tiene 53 páginas', () => {
    expect(numeroDePaginas).toBe(53);
  });

  it('tiene contenido legal en las páginas 1-52 y la página 53 es contraportada sin entradas', () => {
    expect(entradasPorPagina).toHaveLength(53);
    for (let i = 0; i < 52; i++) {
      expect(entradasPorPagina[i]).toBeGreaterThan(0);
    }
    expect(entradasPorPagina[52]).toBe(0);
  });

  it('detecta el período mayo de 2026', () => {
    expect(payload.periodo).toEqual({ anio: 2026, mes: 5 });
  });

  it('detecta exactamente 869 entradas', () => {
    expect(payload.entradasDetectadas).toHaveLength(869);
  });

  it('asigna posiciones globalmente consecutivas 0..868 sin repetidos', () => {
    const posiciones = payload.entradasDetectadas.map((e) => e.posicion);
    expect(posiciones).toEqual([...Array(869).keys()]);
  });

  it('cuenta exactamente 870 referencias de publicación (principal + adicionales)', () => {
    let total = 0;
    for (const e of payload.entradasDetectadas) {
      total += 1;
      const adicionales = e.metadataExtraccion.publicacionesAdicionales as unknown[] | undefined;
      total += adicionales?.length ?? 0;
    }
    expect(total).toBe(870);
  });

  it('respeta la distribución exacta de referencias por tipo, incluida una referencia de tipo inválido', () => {
    const distribucion: Record<string, number> = {};
    const contar = (tipo: string | null) => {
      const clave = tipo ?? 'INVALIDO';
      distribucion[clave] = (distribucion[clave] ?? 0) + 1;
    };
    for (const e of payload.entradasDetectadas) {
      contar(e.publicacion?.tipo ?? null);
      const adicionales = (e.metadataExtraccion.publicacionesAdicionales ??
        []) as Array<{ tipo: string | null }>;
      for (const a of adicionales) contar(a.tipo);
    }
    expect(distribucion).toEqual({
      RO: 135,
      SRO: 106,
      '2SRO': 109,
      '3SRO': 66,
      '4SRO': 55,
      '5SRO': 22,
      '6SRO': 4,
      '7SRO': 3,
      EE: 287,
      EC: 72,
      EJ: 10,
      INVALIDO: 1,
    });
  });

  it('todas las fechas de publicación detectadas caen dentro de mayo de 2026', () => {
    for (const e of payload.entradasDetectadas) {
      if (e.publicacion?.fecha) {
        expect(e.publicacion.fecha.startsWith('2026-05')).toBe(true);
      }
      const adicionales = (e.metadataExtraccion.publicacionesAdicionales ??
        []) as Array<{ fecha: string | null }>;
      for (const a of adicionales) {
        if (a.fecha) expect(a.fecha.startsWith('2026-05')).toBe(true);
      }
    }
  });

  it('detecta exactamente una referencia de tipo inválido "E", preservada como null sin convertirla a EE', () => {
    const invalidas = payload.entradasDetectadas.filter(
      (e) => e.publicacion !== null && e.publicacion.tipo === null,
    );
    expect(invalidas).toHaveLength(1);
    expect(invalidas[0].publicacion).toEqual({
      tipo: null,
      numero: 1389,
      fecha: '2026-05-21',
    });
    expect(invalidas[0].segmentoCrudo).toContain('E 1389 jueves 21 de mayo de 2026');
    expect(invalidas[0].advertencias).toContain(
      'TIPO_PUBLICACION_REGISTRO_OFICIAL_NO_DETECTADO',
    );
  });

  it('detecta exactamente una publicación adicional: EE 1338 (principal) / EE 1345 (adicional)', () => {
    const conMultiples = payload.entradasDetectadas.filter((e) =>
      e.advertencias.includes('MULTIPLES_PUBLICACIONES_DETECTADAS'),
    );
    expect(conMultiples).toHaveLength(1);
    expect(conMultiples[0].publicacion).toEqual({
      tipo: 'EE',
      numero: 1338,
      fecha: '2026-05-06',
    });
    expect(conMultiples[0].metadataExtraccion.publicacionesAdicionales).toEqual([
      { tipo: 'EE', numero: 1345, fecha: '2026-05-08' },
    ]);
  });

  it('detecta exactamente las dos entradas reales sin viñeta esperadas', () => {
    const sinVineta = payload.entradasDetectadas.filter((e) =>
      e.advertencias.includes('ENTRADA_SIN_VINETA'),
    );
    expect(sinVineta).toHaveLength(2);
    expect(sinVineta.some((e) => e.segmentoCrudo.includes('Reci-cletas Ecuador'))).toBe(
      true,
    );
    expect(
      sinVineta.some((e) =>
        e.segmentoCrudo.includes('Club Deportivo Básico Parroquial'),
      ),
    ).toBe(true);
  });

  it('la primera entrada detectada es la esperada', () => {
    const primera = payload.entradasDetectadas[0];
    expect(primera.numero).toBe('ACESS-ACESS-2026-0010-R');
    expect(primera.publicacion).toEqual({ tipo: 'RO', numero: 286, fecha: '2026-05-18' });
  });

  it('la última entrada detectada es la esperada, con el identificador normalizado', () => {
    const ultima = payload.entradasDetectadas[868];
    expect(ultima.numero).toBe('UAFE-DG-2026-0007');
    expect(ultima.publicacion).toEqual({ tipo: 'RO', numero: 291, fecha: '2026-05-26' });
  });

  it('no aparece ningún campo prohibido en ninguna entrada', () => {
    const camposProhibidos = [
      'fuente',
      'anio',
      'camposInferidos',
      'camposAmbiguos',
      'posibleDuplicado',
      'candidatosDuplicados',
      'huellaDeteccion',
      'RECHAZADO',
      'razonRechazo',
    ];
    for (const e of payload.entradasDetectadas) {
      for (const campo of camposProhibidos) {
        expect(Object.prototype.hasOwnProperty.call(e, campo)).toBe(false);
        expect(
          Object.prototype.hasOwnProperty.call(e.metadataExtraccion, campo),
        ).toBe(false);
      }
    }
  });

  it('la URL del resumen mensual nunca aparece como "fuente" de una Norma', () => {
    expect(JSON.stringify(payload)).not.toContain('"fuente"');
    expect(payload.urlResumenMensualRegistroOficial).toBe(URL_FIXTURE);
  });

  describe('calidad de los campos editoriales (estabilización)', () => {
    it('los casos reales de Sentencia, Auto y Decreto quedan correctamente tipados', () => {
      const sentencias = payload.entradasDetectadas.filter((e) => e.tipo === 'Sentencia');
      const autos = payload.entradasDetectadas.filter((e) => e.tipo === 'Auto');
      const decretos = payload.entradasDetectadas.filter((e) => e.tipo === 'Decreto');

      expect(sentencias.length).toBeGreaterThan(0);
      expect(autos.length).toBeGreaterThan(0);
      expect(decretos.length).toBeGreaterThan(0);

      // Ninguna de estas entradas quedó con tipo "Ley" por una mención
      // narrativa previa de "Ley" en el mismo párrafo (A1).
      for (const e of [...sentencias, ...autos, ...decretos]) {
        expect(e.tipo).not.toBe('Ley');
      }

      const auto = autos.find((e) => e.numero === '1-26-OP');
      expect(auto).toBeDefined();

      const numerosDecreto = decretos.map((e) => e.numero);
      expect(numerosDecreto).toEqual(expect.arrayContaining(['379', '387', '389', '391', '392']));
    });

    it('ninguna descripción completa, etiqueta conocida o identificador duplicado aparece como numero', () => {
      for (const e of payload.entradasDetectadas) {
        if (e.numero === null) continue;
        // Algunos identificadores oficiales contienen espacios internos,
        // pero nunca conservan las etiquetas editoriales que los preceden
        // ni repiten exactamente el mismo identificador.
        expect(e.numero.trim().split(/\s+/).length).toBeLessThanOrEqual(3);
        expect(e.numero).not.toMatch(/^(?:caso|de\s+causa)\b/i);
        const duplicado = /^(.+?)\.\s+\1$/u.exec(e.numero);
        expect(duplicado).toBeNull();
      }
    });

    it('ningún identificador contiene espacios de maquetación alrededor de "-" o "/"', () => {
      for (const e of payload.entradasDetectadas) {
        if (e.numero === null) continue;
        expect(e.numero).not.toMatch(/\s[-/]|[-/]\s/);
      }
    });

    it('ninguna institución contiene "MENSUAL DE ÍNDICE" (banner de portada)', () => {
      for (const e of payload.entradasDetectadas) {
        if (e.institucion === null) continue;
        expect(e.institucion).not.toContain('MENSUAL DE');
        expect(e.institucion.toUpperCase()).not.toContain('ÍNDICE');
      }
    });

    it('ninguna institución es una frase descriptiva que empieza con "Se " + verbo', () => {
      for (const e of payload.entradasDetectadas) {
        if (e.institucion === null) continue;
        expect(e.institucion).not.toMatch(/^Se\s+\p{Ll}/u);
      }
    });

    it('ninguna sección estructural conocida se persiste como institución', () => {
      const seccionEstructural =
        /^(?:AVISOS JUDICIALES|FE DE ERRATAS|ORDENANZAS?(?:\s+.+)?|RESOLUCIONES?(?:\s+.+)?|REGLAMENTOS?(?:\s+.+)?)$/;
      for (const e of payload.entradasDetectadas) {
        if (e.institucion === null) continue;
        expect(e.institucion).not.toMatch(seccionEstructural);
      }
    });

    it('proyecta separadamente las secciones estructurales y las instituciones explícitas del PDF piloto', () => {
      const metropolitana = payload.entradasDetectadas.find((e) =>
        e.segmentoCrudo.includes(
          'Concejo del Distrito Metropolitano de Quito: Para la designación vial',
        ),
      );
      expect(metropolitana).toMatchObject({
        seccion: 'ORDENANZAS METROPOLITANAS',
        institucion: 'Concejo del Distrito Metropolitano de Quito',
      });

      const provincial = payload.entradasDetectadas.find((e) =>
        e.segmentoCrudo.includes('Gobierno Provincial de Pastaza:'),
      );
      expect(provincial).toMatchObject({
        seccion: 'ORDENANZAS PROVINCIALES',
        institucion: 'Gobierno Provincial de Pastaza',
      });

      // "GobiernoAutónomo" llega de PDF.js como un único TextItem sin ningún
      // hueco interno que reconstruir (ver estabilización textual, M2): a
      // diferencia de "Descentralizado Parroquial Rural de El Valle:", que
      // sí tiene huecos reales y se reconstruye. Sin evidencia geométrica
      // para separar "GobiernoAutónomo", la institución no se adivina.
      const parroquial = payload.entradasDetectadas.find((e) =>
        e.segmentoCrudo.includes('Parroquial Rural de El Valle:'),
      );
      expect(parroquial).toMatchObject({
        seccion: 'RESOLUCIONES PARROQUIALES RURALES',
        institucion: null,
      });
      expect(parroquial?.advertencias).toContain('INSTITUCION_NO_DETECTADA');
    });

    it('la entrada de Reci-cletas no hereda una descripción de agrupación falsa como institución', () => {
      const reciCletas = payload.entradasDetectadas.find((e) =>
        e.segmentoCrudo.includes('Reci-cletas'),
      );
      expect(reciCletas).toBeDefined();
      expect(reciCletas?.institucion).not.toMatch(/^Se\s+\p{Ll}/u);
      expect(reciCletas?.institucion).not.toContain('siguientes organizaciones');
    });

    it('las advertencias de cada entrada son únicas (sin duplicados)', () => {
      for (const e of payload.entradasDetectadas) {
        expect(new Set(e.advertencias).size).toBe(e.advertencias.length);
      }
    });

    it('POSIBLE_FUSION_ENTRADAS: un párrafo real con dos cláusulas jurídicas e identificadores en conflicto queda con numero/titulo en null, sin dividir la entrada ni adivinar el identificador correcto', () => {
      // Localizado por contenido/publicación, nunca por posición fija: la
      // posición exacta de esta entrada dentro del fixture es un detalle de
      // maquetación del PDF piloto, no una regla de producción.
      const posibleFusion = payload.entradasDetectadas.find((e) =>
        e.segmentoCrudo.includes('Paolina Vercoutere'),
      );
      expect(posibleFusion).toBeDefined();
      expect(posibleFusion?.numero).toBeNull();
      expect(posibleFusion?.titulo).toBeNull();
      expect(posibleFusion?.advertencias).toEqual(
        expect.arrayContaining([
          'POSIBLE_FUSION_ENTRADAS',
          'NUMERO_NORMA_NO_DETECTADO',
          'TITULO_NO_DETECTADO',
        ]),
      );
      // Ambos identificadores en conflicto sobreviven en segmentoCrudo, sin
      // reescritura: la revisión editorial decide después cuál es correcto.
      expect(posibleFusion?.segmentoCrudo).toContain('57-26-IN');
      expect(posibleFusion?.segmentoCrudo).toContain('7-26-IN');
      expect(posibleFusion?.publicacion).toMatchObject({
        tipo: 'EC',
        numero: 245,
      });

      // La entrada de Silvia Patricia Núñez Ramos publicada en EC 235 es una
      // ficha jurídica real, independiente y correctamente formada (su
      // propio identificador, su propia cita de publicación): la detección
      // de fusión del párrafo anterior no debe afectarla en absoluto.
      const entradaIndependiente = payload.entradasDetectadas.find((e) =>
        e.segmentoCrudo.includes('Núñez Ramos, procuradora común'),
      );
      expect(entradaIndependiente).toBeDefined();
      expect(entradaIndependiente?.numero).toBe('33-26-IN');
      expect(entradaIndependiente?.advertencias).not.toContain(
        'POSIBLE_FUSION_ENTRADAS',
      );
      expect(entradaIndependiente?.publicacion).toMatchObject({
        tipo: 'EC',
        numero: 235,
      });
    });
  });

  it('produce el mismo JSON, byte a byte, en una segunda ejecución', () => {
    const salidaJson2 = join(dirTemporal, 'salida-2.json');
    execFileSync('node', [
      CLI_COMPILADO,
      '--pdf', PDF_FIXTURE,
      '--periodo', '2026-05',
      '--url', URL_FIXTURE,
      '--version-extractor', '5c-integral-test',
      '--salida', salidaJson2,
    ]);
    const primeraEjecucion = readFileSync(join(dirTemporal, 'salida-1.json'));
    const segundaEjecucion = readFileSync(salidaJson2);
    expect(segundaEjecucion.equals(primeraEjecucion)).toBe(true);
  }, 30000);
});
