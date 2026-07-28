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
  RazonConsultaCatalogoFallida,
  RepositorioEdicionesRegistroOficial,
  RepositorioUsuarios,
  ResolverFuenteRegistroOficial,
  ResultadoConsultaCatalogoRegistroOficial,
} from '@normativo/aplicacion';
import { EstadoResolucionFuente } from '@normativo/dominio';
import { NormasModule } from '../normas/normas.module';
import { AuthModule } from '../autenticacion/http/auth.module';
import {
  TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
  TOKEN_REPOSITORIO_USUARIOS,
} from '../normas/tokens';
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
        ) =>
          new ResolverFuenteRegistroOficial({
            repositorioUsuarios,
            repositorioEdiciones,
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
        ) =>
          new ResolverFuenteRegistroOficial({
            repositorioUsuarios,
            repositorioEdiciones,
            catalogoRegistroOficial: catalogo,
          }),
        inject: [
          TOKEN_REPOSITORIO_USUARIOS,
          TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
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
