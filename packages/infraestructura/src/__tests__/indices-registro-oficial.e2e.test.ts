import 'reflect-metadata';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type {
  DescargadorPdfIndiceRegistroOficial,
  EntradaDetectadaResumen,
  ExtractorIndiceMensualRegistroOficial,
  RazonDescargaPdfIndiceFallida,
  RazonExtraccionIndiceFallida,
  ResultadoDescargaPdfIndice,
  ResultadoExtraccionIndice,
} from '@normativo/aplicacion';
import { NormasModule } from '../normas/normas.module';
import { AuthModule } from '../autenticacion/http/auth.module';
import { IngestaModule } from '../ingesta/ingesta.module';
import { ServicioTokens } from '../autenticacion/servicio-tokens';
import { CONTRASENA_SEMILLA } from '../memoria/RepositorioCredencialesUsuariosEnMemoria';
import {
  TOKEN_DESCARGADOR_PDF_INDICE_REGISTRO_OFICIAL,
  TOKEN_EXTRACTOR_INDICE_MENSUAL_REGISTRO_OFICIAL,
} from '../ingesta/tokens';

const CORREOS_SEMILLA: Record<string, string> = {
  'usuario-editor-1': 'editor@test.com',
  'usuario-superadmin-1': 'superadmin@test.com',
  'usuario-admin-1': 'admin@test.com',
  'usuario-suscriptor-1': 'suscriptor@test.com',
};

const URL_VALIDA = 'https://esacc.corteconstitucional.gob.ec/storage/x';
const SHA_VALIDO = 'a'.repeat(64);
const VERSION_ACTUAL = 'indice-mensual-v1';

function entradaFake(overrides: Partial<EntradaDetectadaResumen> = {}): EntradaDetectadaResumen {
  return {
    posicion: 0,
    tipo: 'Resolución',
    numero: 'R-1',
    titulo: 'Título de prueba',
    institucion: 'Institución de prueba',
    seccion: 'Función Ejecutiva',
    publicacion: { tipo: 'RO', numero: 900, fecha: '2026-05-04' },
    segmentoCrudo: 'segmento de prueba',
    metadataExtraccion: {},
    advertencias: [],
    confianza: 1,
    ...overrides,
  };
}

/**
 * Doble de infraestructura de los dos puertos técnicos nuevos: las pruebas
 * HTTP de este archivo ejercitan el contrato completo (auth, validación,
 * versión/hash/período, idempotencia, cero escrituras) con datos
 * deterministas, sin depender del sitio oficial ni de Internet. El
 * ejercicio de PDF.js real contra el fixture de mayo de 2026 vive en
 * `extractor-indice-mensual-adaptador.compilado.test.ts` (no puede correr
 * aquí: el sandbox VM de Jest no soporta el `import()` dinámico genuino que
 * requiere `leerPdf`).
 */
class DescargadorPdfIndiceFake implements DescargadorPdfIndiceRegistroOficial {
  readonly llamadas: string[] = [];
  resultado: ResultadoDescargaPdfIndice = {
    exitoso: true,
    bytes: new Uint8Array([1, 2, 3]),
    tamanioBytes: 3,
    sha256Pdf: SHA_VALIDO,
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

class ExtractorIndiceMensualFake implements ExtractorIndiceMensualRegistroOficial {
  readonly versionExtractor = VERSION_ACTUAL;
  llamadas = 0;
  resultado: ResultadoExtraccionIndice = {
    exitoso: true,
    periodoDetectado: { anio: 2026, mes: 5 },
    totalPaginas: 1,
    entradasDetectadas: [entradaFake()],
  };

  configurarExito(
    periodoDetectado = { anio: 2026, mes: 5 },
    entradasDetectadas: EntradaDetectadaResumen[] = [entradaFake()],
  ): void {
    this.resultado = {
      exitoso: true,
      periodoDetectado,
      totalPaginas: 1,
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

function cuerpoAnalizar(overrides: Record<string, unknown> = {}) {
  return {
    urlPdf: URL_VALIDA,
    periodoEsperado: { anio: 2026, mes: 5 },
    ...overrides,
  };
}

function cuerpoConfirmar(overrides: Record<string, unknown> = {}) {
  return {
    urlPdf: URL_VALIDA,
    periodoEsperado: { anio: 2026, mes: 5 },
    sha256PdfObservado: SHA_VALIDO,
    versionExtractorObservada: VERSION_ACTUAL,
    ...overrides,
  };
}

describe('Índices mensuales del Registro Oficial: Analizar/Confirmar (e2e memoria)', () => {
  let app: INestApplication;
  let servicioTokens: ServicioTokens;
  let descargadorFake: DescargadorPdfIndiceFake;
  let extractorFake: ExtractorIndiceMensualFake;
  const tokens = new Map<string, string>();

  beforeEach(async () => {
    tokens.clear();
    descargadorFake = new DescargadorPdfIndiceFake();
    extractorFake = new ExtractorIndiceMensualFake();

    const moduleRef = await Test.createTestingModule({
      imports: [NormasModule, AuthModule, IngestaModule],
    })
      .overrideProvider(TOKEN_DESCARGADOR_PDF_INDICE_REGISTRO_OFICIAL)
      .useValue(descargadorFake)
      .overrideProvider(TOKEN_EXTRACTOR_INDICE_MENSUAL_REGISTRO_OFICIAL)
      .useValue(extractorFake)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    servicioTokens = app.get(ServicioTokens);
  });

  afterEach(async () => {
    await app.close();
  });

  function servidor() {
    return app.getHttpServer();
  }

  async function autorizacionDe(usuarioId: string): Promise<string> {
    const correo = CORREOS_SEMILLA[usuarioId];
    if (correo === undefined) {
      const token = await servicioTokens.firmar({ usuarioId });
      return `Bearer ${token}`;
    }

    let token = tokens.get(usuarioId);
    if (token === undefined) {
      const login = await request(servidor())
        .post('/auth/login')
        .send({ correo, contrasena: CONTRASENA_SEMILLA });
      expect(login.status).toBe(200);
      token = login.body.accessToken as string;
      tokens.set(usuarioId, token);
    }
    return `Bearer ${token}`;
  }

  async function analizarComoSuperadmin(cuerpo: Record<string, unknown>) {
    return request(servidor())
      .post('/ingesta/registro-oficial/indices/analizar')
      .set('Authorization', await autorizacionDe('usuario-superadmin-1'))
      .send(cuerpo);
  }

  async function confirmarComoSuperadmin(cuerpo: Record<string, unknown>) {
    return request(servidor())
      .post('/ingesta/registro-oficial/indices/confirmar')
      .set('Authorization', await autorizacionDe('usuario-superadmin-1'))
      .send(cuerpo);
  }

  async function totalLotes(): Promise<number> {
    const respuesta = await request(servidor())
      .get('/ingesta/registro-oficial/lotes')
      .set('Authorization', await autorizacionDe('usuario-superadmin-1'));
    expect(respuesta.status).toBe(200);
    return (respuesta.body as unknown[]).length;
  }

  describe('POST /ingesta/registro-oficial/indices/analizar', () => {
    it('SUPERADMINISTRADOR: 200 con previsualización completa (todas las entradas, sin muestreo)', async () => {
      extractorFake.configurarExito({ anio: 2026, mes: 5 }, [
        entradaFake({ posicion: 0 }),
        entradaFake({ posicion: 1, advertencias: ['TITULO_NO_DETECTADO'] }),
      ]);

      const respuesta = await analizarComoSuperadmin(cuerpoAnalizar());

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.analisis.periodoEsperado).toEqual({ anio: 2026, mes: 5 });
      expect(respuesta.body.analisis.periodoDetectado).toEqual({ anio: 2026, mes: 5 });
      expect(respuesta.body.analisis.totalEntradas).toBe(2);
      expect(respuesta.body.analisis.totalConAdvertencias).toBe(1);
      expect(respuesta.body.analisis.advertenciasPorTipo).toEqual({
        TITULO_NO_DETECTADO: 1,
      });
      expect(respuesta.body.analisis.versionExtractor).toBe(VERSION_ACTUAL);
      expect(respuesta.body.entradasDetectadas).toHaveLength(2);
    });

    it('Analizar nunca escribe: el número de lotes no cambia', async () => {
      const antes = await totalLotes();

      await analizarComoSuperadmin(cuerpoAnalizar());

      const despues = await totalLotes();
      expect(despues).toBe(antes);
      expect(despues).toBe(0);
    });

    it.each(['usuario-editor-1', 'usuario-admin-1', 'usuario-suscriptor-1'])(
      '%s: 403, sin invocar descarga ni extracción',
      async (usuarioId) => {
        const respuesta = await request(servidor())
          .post('/ingesta/registro-oficial/indices/analizar')
          .set('Authorization', await autorizacionDe(usuarioId))
          .send(cuerpoAnalizar());

        expect(respuesta.status).toBe(403);
        expect(descargadorFake.llamadas).toHaveLength(0);
        expect(extractorFake.llamadas).toBe(0);
      },
    );

    it('sin token: 401', async () => {
      const respuesta = await request(servidor())
        .post('/ingesta/registro-oficial/indices/analizar')
        .send(cuerpoAnalizar());
      expect(respuesta.status).toBe(401);
    });

    it('propiedades adicionales: 400, sin invocar descarga', async () => {
      const respuesta = await analizarComoSuperadmin(
        cuerpoAnalizar({ extra: 'no-deberia-estar-aqui' }),
      );
      expect(respuesta.status).toBe(400);
      expect(descargadorFake.llamadas).toHaveLength(0);
    });

    it('periodoEsperado ausente por completo: 400, sin invocar descarga', async () => {
      const { periodoEsperado: _omitido, ...cuerpoSinPeriodo } =
        cuerpoAnalizar();
      const respuesta = await analizarComoSuperadmin(cuerpoSinPeriodo);
      expect(respuesta.status).toBe(400);
      expect(descargadorFake.llamadas).toHaveLength(0);
    });

    it('URL no permitida: 400 URL_PDF_INDICE_NO_PERMITIDA', async () => {
      descargadorFake.configurarFallo('URL_PDF_INDICE_NO_PERMITIDA');
      const respuesta = await analizarComoSuperadmin(cuerpoAnalizar());
      expect(respuesta.status).toBe(400);
      expect(respuesta.body.message).toBe('URL_PDF_INDICE_NO_PERMITIDA');
    });

    it('PDF demasiado grande: 413', async () => {
      descargadorFake.configurarFallo('PDF_INDICE_DEMASIADO_GRANDE');
      const respuesta = await analizarComoSuperadmin(cuerpoAnalizar());
      expect(respuesta.status).toBe(413);
    });

    it('descarga inválida (remoto no-2xx/redirect): 502', async () => {
      descargadorFake.configurarFallo('DESCARGA_INDICE_INVALIDA');
      const respuesta = await analizarComoSuperadmin(cuerpoAnalizar());
      expect(respuesta.status).toBe(502);
    });

    it('descarga transitoria (red/timeout/5xx): 503', async () => {
      descargadorFake.configurarFallo('DESCARGA_INDICE_TEMPORALMENTE_NO_DISPONIBLE');
      const respuesta = await analizarComoSuperadmin(cuerpoAnalizar());
      expect(respuesta.status).toBe(503);
    });

    it.each<[RazonExtraccionIndiceFallida, number]>([
      ['PDF_INDICE_INVALIDO', 422],
      ['PDF_INDICE_CIFRADO', 422],
      ['PDF_INDICE_SIN_CAPA_DE_TEXTO', 422],
      ['PERIODO_INDICE_NO_DETECTADO', 422],
    ])('extracción fallida %s: %i', async (razon, status) => {
      extractorFake.configurarFallo(razon);
      const respuesta = await analizarComoSuperadmin(cuerpoAnalizar());
      expect(respuesta.status).toBe(status);
      expect(respuesta.body.message).toBe(razon);
    });

    it('período detectado distinto del esperado: 422 PERIODO_INDICE_NO_COINCIDE', async () => {
      extractorFake.configurarExito({ anio: 2026, mes: 6 });
      const respuesta = await analizarComoSuperadmin(cuerpoAnalizar());
      expect(respuesta.status).toBe(422);
      expect(respuesta.body.message).toBe('PERIODO_INDICE_NO_COINCIDE');
    });
  });

  describe('POST /ingesta/registro-oficial/indices/confirmar', () => {
    it('SUPERADMINISTRADOR: 201, delega en la ingesta real y devuelve lote/creado/sha256/versión', async () => {
      const respuesta = await confirmarComoSuperadmin(cuerpoConfirmar());

      expect(respuesta.status).toBe(201);
      expect(respuesta.body.creado).toBe(true);
      expect(respuesta.body.lote.periodoAnio).toBe(2026);
      expect(respuesta.body.lote.periodoMes).toBe(5);
      expect(respuesta.body.sha256Pdf).toBe(SHA_VALIDO);
      expect(respuesta.body.versionExtractor).toBe(VERSION_ACTUAL);

      // El lote es real: consultable por el endpoint existente de Fase 5A.
      const lotes = await totalLotes();
      expect(lotes).toBe(1);
    });

    it.each(['usuario-editor-1', 'usuario-admin-1', 'usuario-suscriptor-1'])(
      '%s: 403, sin invocar descarga ni extracción, sin crear lote',
      async (usuarioId) => {
        const respuesta = await request(servidor())
          .post('/ingesta/registro-oficial/indices/confirmar')
          .set('Authorization', await autorizacionDe(usuarioId))
          .send(cuerpoConfirmar());

        expect(respuesta.status).toBe(403);
        expect(descargadorFake.llamadas).toHaveLength(0);
        expect(extractorFake.llamadas).toBe(0);
        expect(await totalLotes()).toBe(0);
      },
    );

    it('sin token: 401', async () => {
      const respuesta = await request(servidor())
        .post('/ingesta/registro-oficial/indices/confirmar')
        .send(cuerpoConfirmar());
      expect(respuesta.status).toBe(401);
    });

    it('propiedades adicionales: 400', async () => {
      const respuesta = await confirmarComoSuperadmin(
        cuerpoConfirmar({ extra: 'no-deberia-estar-aqui' }),
      );
      expect(respuesta.status).toBe(400);
    });

    it('periodoEsperado ausente por completo: 400, sin invocar descarga', async () => {
      const { periodoEsperado: _omitido, ...cuerpoSinPeriodo } =
        cuerpoConfirmar();
      const respuesta = await confirmarComoSuperadmin(cuerpoSinPeriodo);
      expect(respuesta.status).toBe(400);
      expect(descargadorFake.llamadas).toHaveLength(0);
    });

    it('versionExtractorObservada distinta: 409, sin invocar descarga', async () => {
      const respuesta = await confirmarComoSuperadmin(
        cuerpoConfirmar({ versionExtractorObservada: 'indice-mensual-v0-vieja' }),
      );
      expect(respuesta.status).toBe(409);
      expect(respuesta.body.message).toBe(
        'VERSION_EXTRACTOR_CAMBIO_DESDE_ANALISIS',
      );
      expect(descargadorFake.llamadas).toHaveLength(0);
      expect(await totalLotes()).toBe(0);
    });

    it('sha256PdfObservado distinto del recalculado: 409, sin invocar la extracción', async () => {
      descargadorFake.configurarExito(new Uint8Array([9, 9]), 'b'.repeat(64));
      const respuesta = await confirmarComoSuperadmin(cuerpoConfirmar());
      expect(respuesta.status).toBe(409);
      expect(respuesta.body.message).toBe('PDF_INDICE_CAMBIO_DESDE_ANALISIS');
      expect(extractorFake.llamadas).toBe(0);
      expect(await totalLotes()).toBe(0);
    });

    it('período detectado distinto del esperado: 422, sin crear lote', async () => {
      extractorFake.configurarExito({ anio: 2026, mes: 6 });
      const respuesta = await confirmarComoSuperadmin(cuerpoConfirmar());
      expect(respuesta.status).toBe(422);
      expect(respuesta.body.message).toBe('PERIODO_INDICE_NO_COINCIDE');
      expect(await totalLotes()).toBe(0);
    });

    it('reintento idéntico: creado=false, mismo lote (idempotencia real de Fase 5A)', async () => {
      const primera = await confirmarComoSuperadmin(cuerpoConfirmar());
      const segunda = await confirmarComoSuperadmin(cuerpoConfirmar());

      expect(primera.status).toBe(201);
      expect(segunda.status).toBe(201);
      expect(primera.body.creado).toBe(true);
      expect(segunda.body.creado).toBe(false);
      expect(segunda.body.lote.id).toBe(primera.body.lote.id);
      expect(await totalLotes()).toBe(1);
    });

    it('mismo período con URL de PDF diferente: 409 EJECUCION_INGESTA_CONFLICTIVA aunque el contenido coincida', async () => {
      await confirmarComoSuperadmin(cuerpoConfirmar());

      const respuesta = await confirmarComoSuperadmin(
        cuerpoConfirmar({ urlPdf: `${URL_VALIDA}-otra` }),
      );

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.message).toBe('EJECUCION_INGESTA_CONFLICTIVA');
      expect(await totalLotes()).toBe(1);
    });

    it('mismo período con contenido diferente: 409 EJECUCION_INGESTA_CONFLICTIVA', async () => {
      await confirmarComoSuperadmin(cuerpoConfirmar());

      extractorFake.configurarExito({ anio: 2026, mes: 5 }, [
        entradaFake({ posicion: 0, titulo: 'Título completamente distinto' }),
      ]);
      const respuesta = await confirmarComoSuperadmin(cuerpoConfirmar());

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.message).toBe('EJECUCION_INGESTA_CONFLICTIVA');
      expect(await totalLotes()).toBe(1);
    });

    it('dos confirmaciones concurrentes del mismo período: una gana, la otra reutiliza el mismo lote', async () => {
      // Calienta la autorización (y la escucha del servidor HTTP efímero de
      // supertest) antes de disparar las dos solicitudes en paralelo: evita
      // una carrera de "listen" del servidor de pruebas, ajena a la carrera
      // real de negocio que este test ejercita.
      const autorizacion = await autorizacionDe('usuario-superadmin-1');
      const [primera, segunda] = await Promise.all([
        request(servidor())
          .post('/ingesta/registro-oficial/indices/confirmar')
          .set('Authorization', autorizacion)
          .send(cuerpoConfirmar()),
        request(servidor())
          .post('/ingesta/registro-oficial/indices/confirmar')
          .set('Authorization', autorizacion)
          .send(cuerpoConfirmar()),
      ]);

      expect(primera.status).toBe(201);
      expect(segunda.status).toBe(201);
      expect(primera.body.lote.id).toBe(segunda.body.lote.id);
      const creados = [primera.body.creado, segunda.body.creado];
      expect(creados.sort()).toEqual([false, true]);
      expect(await totalLotes()).toBe(1);
    });

    it('descarga o extracción fallida: cero escrituras (no crea lote)', async () => {
      descargadorFake.configurarFallo('DESCARGA_INDICE_TEMPORALMENTE_NO_DISPONIBLE');
      const respuestaDescarga = await confirmarComoSuperadmin(cuerpoConfirmar());
      expect(respuestaDescarga.status).toBe(503);
      expect(await totalLotes()).toBe(0);

      descargadorFake.configurarExito(new Uint8Array([1, 2, 3]), SHA_VALIDO);
      extractorFake.configurarFallo('PDF_INDICE_CIFRADO');
      const respuestaExtraccion = await confirmarComoSuperadmin(cuerpoConfirmar());
      expect(respuestaExtraccion.status).toBe(422);
      expect(await totalLotes()).toBe(0);
    });

    it('no resuelve fuentes ni publica normas: las ediciones quedan PENDIENTE y las normas en BORRADOR', async () => {
      const confirmacion = await confirmarComoSuperadmin(cuerpoConfirmar());
      expect(confirmacion.status).toBe(201);

      const lista = await request(servidor())
        .get('/normas?estadoEditorial=BORRADOR')
        .set('Authorization', await autorizacionDe('usuario-superadmin-1'));
      expect(lista.status).toBe(200);
      expect(lista.body.length).toBeGreaterThan(0);
      for (const norma of lista.body) {
        expect(norma.edicionesRegistroOficial[0].fuente).toBeNull();
      }
    });
  });
});
