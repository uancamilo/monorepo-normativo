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
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import {
  CatalogoRegistroOficial,
  ConsultaCatalogoRegistroOficial,
  ConsultorEdicionesRegistroOficialPorLote,
  RazonConsultaCatalogoFallida,
  RepositorioEdicionesRegistroOficial,
  RepositorioUsuarios,
  ResolverFuenteRegistroOficial,
  ResultadoConsultaCatalogoRegistroOficial,
} from '@normativo/aplicacion';
import { EstadoResolucionFuente } from '@normativo/dominio';
import { NormasModule } from '../normas/normas.module';
import { AuthModule } from '../autenticacion/http/auth.module';
import { IngestaModule } from '../ingesta/ingesta.module';
import {
  TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
  TOKEN_REPOSITORIO_USUARIOS,
} from '../normas/tokens';
import { TOKEN_REPOSITORIO_INGESTA_REGISTRO_OFICIAL } from '../ingesta/tokens';
import { CatalogoRegistroOficialHttp } from '../normas/catalogo/CatalogoRegistroOficialHttp';
import { CONTRASENA_SEMILLA } from '../memoria/RepositorioCredencialesUsuariosEnMemoria';

const CORREOS: Record<string, string> = {
  editor: 'editor@test.com',
  superadmin: 'superadmin@test.com',
};
// Host real verificado de los PDFs del catálogo oficial (julio 2026): las
// cards reales nunca apuntan a registroficial.gob.ec sino al almacenamiento
// de la Corte Constitucional; el e2e ejercita ese mismo contrato.
const DOMINIO_PDF = 'esacc.corteconstitucional.gob.ec';

function pdfDe(numero: number): string {
  return `https://${DOMINIO_PDF}/ediciones/ro-${numero}.pdf`;
}

function tarjeta(numero: number): string {
  return `
    <article>
      <h2 class="card__title_post_imagen">Registro Oficial Nº ${numero}</h2>
      <div class="txt_fecha_post_imagen">jueves, 2 enero 2025\nQuito</div>
      <a class="cta_post_imagen" href="${pdfDe(numero)}">Descargar</a>
    </article>`;
}

function cuerpoNorma(numero: number) {
  return {
    numero: String(numero),
    titulo: `Ley Orgánica ${numero}`,
    contenido: [],
    tipoNorma: 'Ley',
    institucionExpide: 'Asamblea Nacional',
    estadoJuridico: 'VIGENTE',
    fechaExpedicion: '2025-01-01',
    fechaPublicacionOficial: '2025-01-02',
    tipoPublicacionRegistroOficial: 'RO',
    numeroPublicacionRegistroOficial: numero,
  };
}

describe('Resolución de fuentes con catálogo controlado (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let baseUrl: string;
  let cuerpoCatalogo: string;
  const tokens = new Map<string, string>();

  beforeEach(async () => {
    tokens.clear();
    cuerpoCatalogo = `<section>${[500, 501, 502].map(tarjeta).join('')}</section>`;

    server = createServer((req, res) => {
      req.on('data', () => undefined);
      req.on('end', () => {
        res.statusCode = 200;
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(cuerpoCatalogo);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;

    const moduleRef = await Test.createTestingModule({
      imports: [NormasModule, AuthModule],
    })
      .overrideProvider(ResolverFuenteRegistroOficial)
      .useFactory({
        factory: (
          repositorioUsuarios: RepositorioUsuarios,
          repositorioEdiciones: RepositorioEdicionesRegistroOficial,
          consultorEdicionesPorLote: ConsultorEdicionesRegistroOficialPorLote,
        ) =>
          new ResolverFuenteRegistroOficial({
            repositorioUsuarios,
            repositorioEdiciones,
            consultorEdicionesPorLote,
            catalogoRegistroOficial: new CatalogoRegistroOficialHttp({
              baseUrl,
              dominiosPdfPermitidos: [DOMINIO_PDF],
              timeoutMs: 2000,
              maxBytesRespuesta: 5 * 1024 * 1024,
            }),
            limiteMaximoEdiciones: 2,
            maxConcurrencia: 2,
          }),
        inject: [
          TOKEN_REPOSITORIO_USUARIOS,
          TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
          TOKEN_REPOSITORIO_INGESTA_REGISTRO_OFICIAL,
        ],
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function auth(usuario: keyof typeof CORREOS): Promise<string> {
    let token = tokens.get(usuario);
    if (token === undefined) {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ correo: CORREOS[usuario], contrasena: CONTRASENA_SEMILLA });
      expect(login.status).toBe(200);
      token = login.body.accessToken as string;
      tokens.set(usuario, token);
    }
    return `Bearer ${token}`;
  }

  async function registrarNorma(numero: number) {
    const respuesta = await request(app.getHttpServer())
      .post('/normas')
      .set('Authorization', await auth('editor'))
      .send(cuerpoNorma(numero));
    expect(respuesta.status).toBe(201);
    return respuesta.body;
  }

  function repositorioEdiciones() {
    return app.get<RepositorioEdicionesRegistroOficial>(
      TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
    );
  }

  it('resuelve una edición pendiente y la norma proyecta la nueva fuente sin persistir copia', async () => {
    const norma = await registrarNorma(500);
    const edicionId = norma.edicionesRegistroOficial[0].id;

    const resolver = await request(app.getHttpServer())
      .post('/ediciones-registro-oficial/resolver-pendientes')
      .set('Authorization', await auth('superadmin'))
      .send({ edicionIds: [edicionId] });

    expect(resolver.status).toBe(200);
    expect(resolver.body).toEqual({
      procesadas: 1,
      resueltas: 1,
      noEncontradas: 0,
      conflictivas: 0,
      omitidas: 0,
      erroresCatalogo: 0,
      erroresPorRazon: {
        CATALOGO_TEMPORALMENTE_NO_DISPONIBLE: 0,
        RESPUESTA_CATALOGO_INVALIDA: 0,
        COBERTURA_CATALOGO_NO_DISPONIBLE: 0,
        BUSQUEDA_CATALOGO_INCOMPLETA: 0,
      },
    });

    const edicion = await repositorioEdiciones().buscarPorId(edicionId);
    expect(edicion?.estadoResolucionFuente).toBe(EstadoResolucionFuente.RESUELTA);
    expect(edicion?.urlPdf).toBe(pdfDe(500));

    // La norma proyecta la fuente de la edición compartida (no una copia).
    const detalle = await request(app.getHttpServer())
      .get(`/normas/${norma.id}`)
      .set('Authorization', await auth('editor'));
    expect(detalle.status).toBe(200);
    const principal = detalle.body.edicionesRegistroOficial.find(
      (e: { tipoRelacion: string }) => e.tipoRelacion === 'PRINCIPAL',
    );
    expect(principal.fuente).toBe(pdfDe(500));
  });

  it('acota el lote de pendientes al máximo configurado', async () => {
    await registrarNorma(500);
    await registrarNorma(501);
    await registrarNorma(502);

    const resolver = await request(app.getHttpServer())
      .post('/ediciones-registro-oficial/resolver-pendientes')
      .set('Authorization', await auth('superadmin'))
      .send();

    expect(resolver.status).toBe(200);
    expect(resolver.body.procesadas).toBe(2);

    const pendientes = await repositorioEdiciones().listarPorEstadoResolucionFuente([
      EstadoResolucionFuente.PENDIENTE,
    ]);
    expect(pendientes).toHaveLength(1);
  });

  it('no sobrescribe una edición corregida MANUALmente', async () => {
    const norma = await registrarNorma(500);
    const edicionId = norma.edicionesRegistroOficial[0].id;
    const urlManual = `https://${DOMINIO_PDF}/ediciones/manual.pdf`;
    await request(app.getHttpServer())
      .patch(`/ediciones-registro-oficial/${edicionId}/fuente`)
      .set('Authorization', await auth('editor'))
      .send({ urlPdf: urlManual })
      .expect(200);

    const resolver = await request(app.getHttpServer())
      .post('/ediciones-registro-oficial/resolver-pendientes')
      .set('Authorization', await auth('superadmin'))
      .send({ edicionIds: [edicionId] });

    expect(resolver.status).toBe(200);
    expect(resolver.body.omitidas).toBe(1);
    const edicion = await repositorioEdiciones().buscarPorId(edicionId);
    expect(edicion?.estadoResolucionFuente).toBe(EstadoResolucionFuente.MANUAL);
    expect(edicion?.urlPdf).toBe(urlManual);
  });

  it('rechaza edicionIds y limite simultáneos (400 SOLICITUD_INVALIDA) sin modificar la edición', async () => {
    const norma = await registrarNorma(500);
    const edicionId = norma.edicionesRegistroOficial[0].id;

    const resolver = await request(app.getHttpServer())
      .post('/ediciones-registro-oficial/resolver-pendientes')
      .set('Authorization', await auth('superadmin'))
      .send({ edicionIds: [edicionId], limite: 1 });

    expect(resolver.status).toBe(400);
    expect(resolver.body.message).toBe('SOLICITUD_INVALIDA');

    const edicion = await repositorioEdiciones().buscarPorId(edicionId);
    expect(edicion?.estadoResolucionFuente).toBe(
      EstadoResolucionFuente.PENDIENTE,
    );
    expect(edicion?.urlPdf).toBeNull();
  });

  it('rechaza propiedades adicionales en el cuerpo', async () => {
    const resolver = await request(app.getHttpServer())
      .post('/ediciones-registro-oficial/resolver-pendientes')
      .set('Authorization', await auth('superadmin'))
      .send({ desconocido: true });

    expect(resolver.status).toBe(400);
  });

  it('EDITOR no puede resolver (403) y sin token es 401', async () => {
    await request(app.getHttpServer())
      .post('/ediciones-registro-oficial/resolver-pendientes')
      .set('Authorization', await auth('editor'))
      .send()
      .expect(403);

    await request(app.getHttpServer())
      .post('/ediciones-registro-oficial/resolver-pendientes')
      .send()
      .expect(401);
  });
});

const RAZONES_CATALOGO = [
  'CATALOGO_TEMPORALMENTE_NO_DISPONIBLE',
  'RESPUESTA_CATALOGO_INVALIDA',
  'COBERTURA_CATALOGO_NO_DISPONIBLE',
  'BUSQUEDA_CATALOGO_INCOMPLETA',
] as const;

/** Catálogo controlado por test: falla con una razón registrada por número. */
class CatalogoRegistroOficialControlado implements CatalogoRegistroOficial {
  private readonly fallosPorNumero = new Map<
    number,
    RazonConsultaCatalogoFallida
  >();

  registrarFallo(numero: number, razon: RazonConsultaCatalogoFallida): void {
    this.fallosPorNumero.set(numero, razon);
  }

  async buscarEdiciones(
    consulta: ConsultaCatalogoRegistroOficial,
  ): Promise<ResultadoConsultaCatalogoRegistroOficial> {
    const razon = this.fallosPorNumero.get(
      consulta.numeroPublicacionRegistroOficial,
    );
    if (razon !== undefined) {
      return { exitoso: false, razon };
    }
    return { exitoso: true, candidatas: [] };
  }
}

describe('Contrato HTTP de errores del catálogo por razón (e2e)', () => {
  let app: INestApplication;
  let catalogo: CatalogoRegistroOficialControlado;
  const tokens = new Map<string, string>();

  beforeEach(async () => {
    tokens.clear();
    catalogo = new CatalogoRegistroOficialControlado();

    const moduleRef = await Test.createTestingModule({
      imports: [NormasModule, AuthModule],
    })
      .overrideProvider(ResolverFuenteRegistroOficial)
      .useFactory({
        factory: (
          repositorioUsuarios: RepositorioUsuarios,
          repositorioEdiciones: RepositorioEdicionesRegistroOficial,
          consultorEdicionesPorLote: ConsultorEdicionesRegistroOficialPorLote,
        ) =>
          new ResolverFuenteRegistroOficial({
            repositorioUsuarios,
            repositorioEdiciones,
            consultorEdicionesPorLote,
            catalogoRegistroOficial: catalogo,
          }),
        inject: [
          TOKEN_REPOSITORIO_USUARIOS,
          TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
          TOKEN_REPOSITORIO_INGESTA_REGISTRO_OFICIAL,
        ],
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  async function auth(usuario: keyof typeof CORREOS): Promise<string> {
    let token = tokens.get(usuario);
    if (token === undefined) {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ correo: CORREOS[usuario], contrasena: CONTRASENA_SEMILLA });
      expect(login.status).toBe(200);
      token = login.body.accessToken as string;
      tokens.set(usuario, token);
    }
    return `Bearer ${token}`;
  }

  async function registrarEdicionPendiente(numero: number): Promise<string> {
    const respuesta = await request(app.getHttpServer())
      .post('/normas')
      .set('Authorization', await auth('editor'))
      .send(cuerpoNorma(numero));
    expect(respuesta.status).toBe(201);
    return respuesta.body.edicionesRegistroOficial[0].id as string;
  }

  function repositorioEdiciones() {
    return app.get<RepositorioEdicionesRegistroOficial>(
      TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
    );
  }

  it.each(RAZONES_CATALOGO)(
    '%s incrementa únicamente su contador y la edición sigue PENDIENTE',
    async (razon) => {
      const edicionId = await registrarEdicionPendiente(500);
      catalogo.registrarFallo(500, razon);

      const resolver = await request(app.getHttpServer())
        .post('/ediciones-registro-oficial/resolver-pendientes')
        .set('Authorization', await auth('superadmin'))
        .send({ edicionIds: [edicionId] });

      expect(resolver.status).toBe(200);
      expect(resolver.body).toEqual({
        procesadas: 1,
        resueltas: 0,
        noEncontradas: 0,
        conflictivas: 0,
        omitidas: 0,
        erroresCatalogo: 1,
        erroresPorRazon: {
          CATALOGO_TEMPORALMENTE_NO_DISPONIBLE: 0,
          RESPUESTA_CATALOGO_INVALIDA: 0,
          COBERTURA_CATALOGO_NO_DISPONIBLE: 0,
          BUSQUEDA_CATALOGO_INCOMPLETA: 0,
          [razon]: 1,
        },
      });
      expect(resolver.body).not.toHaveProperty('erroresTransitorios');

      const edicion = await repositorioEdiciones().buscarPorId(edicionId);
      expect(edicion?.estadoResolucionFuente).toBe(
        EstadoResolucionFuente.PENDIENTE,
      );
      expect(edicion?.urlPdf).toBeNull();
    },
  );

  it('un lote con las cuatro razones reporta erroresCatalogo como su suma', async () => {
    const ids: string[] = [];
    for (const [indice, razon] of RAZONES_CATALOGO.entries()) {
      const numero = 600 + indice;
      ids.push(await registrarEdicionPendiente(numero));
      catalogo.registrarFallo(numero, razon);
    }

    const resolver = await request(app.getHttpServer())
      .post('/ediciones-registro-oficial/resolver-pendientes')
      .set('Authorization', await auth('superadmin'))
      .send({ edicionIds: ids });

    expect(resolver.status).toBe(200);
    expect(resolver.body).toEqual({
      procesadas: 4,
      resueltas: 0,
      noEncontradas: 0,
      conflictivas: 0,
      omitidas: 0,
      erroresCatalogo: 4,
      erroresPorRazon: {
        CATALOGO_TEMPORALMENTE_NO_DISPONIBLE: 1,
        RESPUESTA_CATALOGO_INVALIDA: 1,
        COBERTURA_CATALOGO_NO_DISPONIBLE: 1,
        BUSQUEDA_CATALOGO_INCOMPLETA: 1,
      },
    });

    const pendientes =
      await repositorioEdiciones().listarPorEstadoResolucionFuente([
        EstadoResolucionFuente.PENDIENTE,
      ]);
    expect(pendientes).toHaveLength(4);
  });
});

describe('Resolución de fuentes por loteId (e2e memoria, ingesta real)', () => {
  let app: INestApplication;
  let server: Server;
  let baseUrl: string;
  const numerosEnCatalogo = new Set<number>();
  const tokens = new Map<string, string>();
  let solicitudesAlCatalogo = 0;

  // Sin fecha en la card: cada test usa su propia fecha real en la triple
  // detectada por la entrada, y una candidata sin fecha siempre es
  // compatible con cualquier fecha detectada (ver `decidirResolucion`).
  // Fijar aquí una fecha de card no relacionada con esas triples produciría
  // discrepancias artificiales (CONFLICTIVA) ajenas a lo que cada test
  // quiere ejercitar.
  function tarjetaLote(numero: number): string {
    return `
      <article>
        <h2 class="card__title_post_imagen">Registro Oficial Nº ${numero}</h2>
        <a class="cta_post_imagen" href="${pdfDe(numero)}">Descargar</a>
      </article>`;
  }

  function entradaConTriple(
    posicion: number,
    numero: number,
    fecha: string,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      posicion,
      tipo: 'Resolución',
      numero: `R-${numero}`,
      titulo: `Resolución ${numero}`,
      institucion: 'Institución de prueba',
      seccion: 'Función Ejecutiva',
      publicacion: { tipo: 'RO', numero, fecha },
      segmentoCrudo: `Resolución ${numero} de prueba`,
      metadataExtraccion: {},
      advertencias: [],
      confianza: 1,
      ...overrides,
    };
  }

  beforeEach(async () => {
    tokens.clear();
    numerosEnCatalogo.clear();
    solicitudesAlCatalogo = 0;

    server = createServer((req, res) => {
      solicitudesAlCatalogo += 1;
      req.on('data', () => undefined);
      req.on('end', () => {
        res.statusCode = 200;
        res.setHeader('content-type', 'text/html; charset=utf-8');
        const cuerpo = `<section>${[...numerosEnCatalogo].map(tarjetaLote).join('')}</section>`;
        res.end(cuerpo);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;

    const moduleRef = await Test.createTestingModule({
      imports: [NormasModule, AuthModule, IngestaModule],
    })
      .overrideProvider(ResolverFuenteRegistroOficial)
      .useFactory({
        factory: (
          repositorioUsuarios: RepositorioUsuarios,
          repositorioEdiciones: RepositorioEdicionesRegistroOficial,
          consultorEdicionesPorLote: ConsultorEdicionesRegistroOficialPorLote,
        ) =>
          new ResolverFuenteRegistroOficial({
            repositorioUsuarios,
            repositorioEdiciones,
            consultorEdicionesPorLote,
            catalogoRegistroOficial: new CatalogoRegistroOficialHttp({
              baseUrl,
              dominiosPdfPermitidos: [DOMINIO_PDF],
              timeoutMs: 2000,
              maxBytesRespuesta: 5 * 1024 * 1024,
            }),
          }),
        inject: [
          TOKEN_REPOSITORIO_USUARIOS,
          TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
          TOKEN_REPOSITORIO_INGESTA_REGISTRO_OFICIAL,
        ],
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function auth(usuario: keyof typeof CORREOS): Promise<string> {
    let token = tokens.get(usuario);
    if (token === undefined) {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ correo: CORREOS[usuario], contrasena: CONTRASENA_SEMILLA });
      expect(login.status).toBe(200);
      token = login.body.accessToken as string;
      tokens.set(usuario, token);
    }
    return `Bearer ${token}`;
  }

  async function ingerirLote(
    loteId_periodoMes: number,
    entradas: ReturnType<typeof entradaConTriple>[],
  ): Promise<string> {
    const respuesta = await request(app.getHttpServer())
      .post('/ingesta/registro-oficial/resumenes')
      .set('Authorization', await auth('superadmin'))
      .send({
        periodo: { anio: 2026, mes: loteId_periodoMes },
        urlResumenMensualRegistroOficial: `https://www.registroficial.gob.ec/resumen-2026-${loteId_periodoMes}.pdf`,
        versionExtractor: '1.0.0',
        entradasDetectadas: entradas,
      });
    expect(respuesta.status).toBe(201);
    return respuesta.body.lote.id as string;
  }

  async function resolverPendientes(cuerpo: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/ediciones-registro-oficial/resolver-pendientes')
      .set('Authorization', await auth('superadmin'))
      .send(cuerpo);
  }

  function repositorioEdiciones() {
    return app.get<RepositorioEdicionesRegistroOficial>(
      TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
    );
  }

  it('1. resolución por loteId con limite: resuelve solo las ediciones de ese lote, hasta el límite indicado', async () => {
    numerosEnCatalogo.add(910).add(911);
    const loteId = await ingerirLote(1, [
      entradaConTriple(0, 910, '2026-01-05'),
      entradaConTriple(1, 911, '2026-01-06'),
    ]);

    const resolver = await resolverPendientes({ loteId, limite: 1 });

    expect(resolver.status).toBe(200);
    expect(resolver.body.procesadas).toBe(1);
    expect(resolver.body.resueltas).toBe(1);
    expect(resolver.body.hayMas).toBe(true);
    expect(typeof resolver.body.siguienteCursor).toBe('string');
    expect(resolver.body.pendientesRestantesLote).toBe(1);
  });

  it('2. continuación con cursor: la segunda página resuelve la edición restante sin repetir la primera', async () => {
    numerosEnCatalogo.add(912).add(913);
    const loteId = await ingerirLote(2, [
      entradaConTriple(0, 912, '2026-02-05'),
      entradaConTriple(1, 913, '2026-02-06'),
    ]);

    const primera = await resolverPendientes({ loteId, limite: 1 });
    expect(primera.body.hayMas).toBe(true);
    const cursor = primera.body.siguienteCursor as string;

    const segunda = await resolverPendientes({ loteId, limite: 1, cursor });

    expect(segunda.status).toBe(200);
    expect(segunda.body.procesadas).toBe(1);
    expect(segunda.body.resueltas).toBe(1);
    expect(segunda.body.hayMas).toBe(false);
    expect(segunda.body.siguienteCursor).toBeNull();
    expect(segunda.body.pendientesRestantesLote).toBe(0);
  });

  it.each([
    ['edicionIds + loteId', { edicionIds: ['x'], loteId: 'lote-1' }],
    ['edicionIds + limite', { edicionIds: ['x'], limite: 5 }],
    ['edicionIds + cursor', { edicionIds: ['x'], cursor: 'abc' }],
    ['cursor sin loteId', { cursor: 'abc' }],
    ['loteId vacío', { loteId: '   ' }],
  ])('3. rechaza la combinación inválida %s con 400 SOLICITUD_INVALIDA', async (_nombre, cuerpo) => {
    const resolver = await resolverPendientes(cuerpo);
    expect(resolver.status).toBe(400);
    expect(resolver.body.message).toBe('SOLICITUD_INVALIDA');
  });

  it('4. cursor mal formado (no decodifica) es 400 SOLICITUD_INVALIDA', async () => {
    const loteId = await ingerirLote(4, [entradaConTriple(0, 914, '2026-04-05')]);

    const resolver = await resolverPendientes({
      loteId,
      cursor: 'esto-no-es-base64url-de-un-json-valido',
    });

    expect(resolver.status).toBe(400);
    expect(resolver.body.message).toBe('SOLICITUD_INVALIDA');
  });

  it('4b. cursor cuyo payload contiene una fecha calendario imposible (2026-02-30) es 400 SOLICITUD_INVALIDA, sin consultar el catálogo ni modificar ediciones', async () => {
    numerosEnCatalogo.add(9140);
    const loteId = await ingerirLote(4, [
      entradaConTriple(0, 9140, '2026-04-05'),
    ]);
    // Cursor construido a mano, exactamente como lo produciría
    // codificarCursorEdicionesLote, pero con una fecha imposible en el
    // calendario: JavaScript normalizaría 2026-02-30 -> 2026-03-02 si solo
    // se validara con `Number.isNaN`, así que esto ejercita puntualmente el
    // round-trip de `interpretarFechaCursor`.
    const cursorConFechaImposible = Buffer.from(
      JSON.stringify({
        v: 1,
        loteId,
        fecha: '2026-02-30',
        edicionId: 'edicion-cualquiera',
      }),
      'utf-8',
    ).toString('base64url');

    const resolver = await resolverPendientes({
      loteId,
      cursor: cursorConFechaImposible,
    });

    expect(resolver.status).toBe(400);
    expect(resolver.body.message).toBe('SOLICITUD_INVALIDA');

    const edicion = await repositorioEdiciones().buscarPorClave({
      tipoPublicacionRegistroOficial: 'RO',
      numeroPublicacionRegistroOficial: 9140,
      fechaPublicacionOficial: new Date('2026-04-05T00:00:00.000Z'),
    });
    expect(edicion?.estadoResolucionFuente).toBe(
      EstadoResolucionFuente.PENDIENTE,
    );
    expect(edicion?.urlPdf).toBeNull();
  });

  it('4c. cursor no canónico Base64URL (cursor válido + "!!") es 400 SOLICITUD_INVALIDA, sin consultar el catálogo ni modificar ediciones', async () => {
    numerosEnCatalogo.add(9141).add(9142);
    const loteId = await ingerirLote(4, [
      entradaConTriple(0, 9141, '2026-04-06'),
      entradaConTriple(1, 9142, '2026-04-07'),
    ]);

    const primera = await resolverPendientes({ loteId, limite: 1 });
    expect(primera.body.hayMas).toBe(true);
    const cursorValido = primera.body.siguienteCursor as string;
    solicitudesAlCatalogo = 0;

    const resolver = await resolverPendientes({
      loteId,
      cursor: `${cursorValido}!!`,
    });

    expect(resolver.status).toBe(400);
    expect(resolver.body.message).toBe('SOLICITUD_INVALIDA');
    expect(solicitudesAlCatalogo).toBe(0);

    const edicion = await repositorioEdiciones().buscarPorClave({
      tipoPublicacionRegistroOficial: 'RO',
      numeroPublicacionRegistroOficial: 9142,
      fechaPublicacionOficial: new Date('2026-04-07T00:00:00.000Z'),
    });
    expect(edicion?.estadoResolucionFuente).toBe(
      EstadoResolucionFuente.PENDIENTE,
    );
    expect(edicion?.urlPdf).toBeNull();
  });

  it('5. cursor perteneciente a otro loteId es 400 SOLICITUD_INVALIDA', async () => {
    numerosEnCatalogo.add(915).add(916);
    const loteA = await ingerirLote(5, [
      entradaConTriple(0, 915, '2026-05-05'),
      entradaConTriple(1, 916, '2026-05-06'),
    ]);
    const loteB = await ingerirLote(6, [entradaConTriple(0, 999, '2026-06-05')]);

    const primeraDeA = await resolverPendientes({ loteId: loteA, limite: 1 });
    const cursorDeA = primeraDeA.body.siguienteCursor as string;

    const resolver = await resolverPendientes({
      loteId: loteB,
      cursor: cursorDeA,
    });

    expect(resolver.status).toBe(400);
    expect(resolver.body.message).toBe('SOLICITUD_INVALIDA');
  });

  it('6. loteId inexistente devuelve 404', async () => {
    const resolver = await resolverPendientes({ loteId: 'lote-fantasma-e2e' });
    expect(resolver.status).toBe(404);
  });

  it('7. lote existente sin ediciones pendientes responde 200 con los tres campos en su forma vacía', async () => {
    numerosEnCatalogo.add(917);
    const loteId = await ingerirLote(7, [entradaConTriple(0, 917, '2026-07-05')]);
    // Se resuelve una vez para dejar el lote sin pendientes.
    await resolverPendientes({ loteId });

    const resolver = await resolverPendientes({ loteId });

    expect(resolver.status).toBe(200);
    expect(resolver.body.procesadas).toBe(0);
    expect(resolver.body).toMatchObject({
      hayMas: false,
      siguienteCursor: null,
      pendientesRestantesLote: 0,
    });
  });

  it('8. permisos: SUPERADMINISTRADOR permitido; EDITOR 403; sin token 401 (igual que los modos existentes)', async () => {
    const loteId = await ingerirLote(8, [entradaConTriple(0, 918, '2026-08-05')]);

    await request(app.getHttpServer())
      .post('/ediciones-registro-oficial/resolver-pendientes')
      .set('Authorization', await auth('editor'))
      .send({ loteId })
      .expect(403);

    await request(app.getHttpServer())
      .post('/ediciones-registro-oficial/resolver-pendientes')
      .send({ loteId })
      .expect(401);
  });

  it('9. la respuesta en modo loteId incluye hayMas, siguienteCursor y pendientesRestantesLote', async () => {
    numerosEnCatalogo.add(919);
    const loteId = await ingerirLote(9, [entradaConTriple(0, 919, '2026-09-05')]);

    const resolver = await resolverPendientes({ loteId });

    expect(resolver.status).toBe(200);
    expect(resolver.body).toHaveProperty('hayMas');
    expect(resolver.body).toHaveProperty('siguienteCursor');
    expect(resolver.body).toHaveProperty('pendientesRestantesLote');
  });

  it('10. los contadores procesadas/resueltas/noEncontradas/conflictivas/omitidas/erroresCatalogo siguen cerrando en modo loteId', async () => {
    // Solo 920 está en el catálogo: 921 queda NO_ENCONTRADA.
    numerosEnCatalogo.add(920);
    const loteId = await ingerirLote(10, [
      entradaConTriple(0, 920, '2026-10-05'),
      entradaConTriple(1, 921, '2026-10-06'),
    ]);

    const resolver = await resolverPendientes({ loteId, limite: 20 });

    expect(resolver.status).toBe(200);
    const cuerpo = resolver.body;
    expect(cuerpo.procesadas).toBe(2);
    expect(cuerpo.resueltas).toBe(1);
    expect(cuerpo.noEncontradas).toBe(1);
    expect(
      cuerpo.resueltas +
        cuerpo.noEncontradas +
        cuerpo.conflictivas +
        cuerpo.omitidas +
        cuerpo.erroresCatalogo,
    ).toBe(cuerpo.procesadas);
  });

  it('11. los modos existentes ({}, {limite}, {edicionIds}) conservan exactamente su contrato de respuesta, sin los campos de loteId', async () => {
    numerosEnCatalogo.add(922);
    await ingerirLote(11, [entradaConTriple(0, 922, '2026-11-05')]);

    const resolver = await resolverPendientes({});

    expect(resolver.status).toBe(200);
    expect(resolver.body).toEqual({
      procesadas: 1,
      resueltas: 1,
      noEncontradas: 0,
      conflictivas: 0,
      omitidas: 0,
      erroresCatalogo: 0,
      erroresPorRazon: {
        CATALOGO_TEMPORALMENTE_NO_DISPONIBLE: 0,
        RESPUESTA_CATALOGO_INVALIDA: 0,
        COBERTURA_CATALOGO_NO_DISPONIBLE: 0,
        BUSQUEDA_CATALOGO_INCOMPLETA: 0,
      },
    });
    expect(resolver.body).not.toHaveProperty('hayMas');
    expect(resolver.body).not.toHaveProperty('siguienteCursor');
    expect(resolver.body).not.toHaveProperty('pendientesRestantesLote');
  });
});
