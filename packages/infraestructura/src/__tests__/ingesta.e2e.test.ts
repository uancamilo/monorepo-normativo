import 'reflect-metadata';
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
// Se montan los módulos de memoria directamente (igual que normas.e2e) para
// que este e2e no dependa de la variable PERSISTENCIA del entorno.
import { NormasModule } from '../normas/normas.module';
import { AuthModule } from '../autenticacion/http/auth.module';
import { IngestaModule } from '../ingesta/ingesta.module';
import { ServicioTokens } from '../autenticacion/servicio-tokens';
import { CONTRASENA_SEMILLA } from '../memoria/RepositorioCredencialesUsuariosEnMemoria';

const CORREOS_SEMILLA: Record<string, string> = {
  'usuario-editor-1': 'editor@test.com',
  'usuario-superadmin-1': 'superadmin@test.com',
  'usuario-admin-1': 'admin@test.com',
  'usuario-suscriptor-1': 'suscriptor@test.com',
};

function entradaValida(overrides: Record<string, unknown> = {}) {
  return {
    posicion: 0,
    tipo: 'Acuerdo Ministerial',
    numero: '123',
    titulo: 'Acuerdo Ministerial 123 de Prueba',
    institucion: 'Ministerio de Prueba',
    seccion: 'Función Ejecutiva',
    publicacion: {
      tipo: 'RO',
      numero: 500,
      fecha: '2026-05-02',
    },
    segmentoCrudo: 'Acuerdo Ministerial 123: disposición de prueba',
    metadataExtraccion: { filaPdf: 4 },
    advertencias: [],
    confianza: 0.95,
    ...overrides,
  };
}

function cuerpoLoteValido(overrides: Record<string, unknown> = {}) {
  return {
    periodo: { anio: 2026, mes: 5 },
    urlResumenMensualRegistroOficial:
      'https://www.registroficial.gob.ec/resumen-2026-05.pdf',
    versionExtractor: '1.0.0',
    entradasDetectadas: [entradaValida()],
    ...overrides,
  };
}

describe('Ingesta Registro Oficial (e2e memoria)', () => {
  let app: INestApplication;
  let servicioTokens: ServicioTokens;
  const tokens = new Map<string, string>();

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [NormasModule, AuthModule, IngestaModule],
    }).compile();

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

  async function ingerirComoSuperadmin(cuerpo: Record<string, unknown>) {
    return request(servidor())
      .post('/ingesta/registro-oficial/resumenes')
      .set('Authorization', await autorizacionDe('usuario-superadmin-1'))
      .send(cuerpo);
  }

  async function consultarLoteComoSuperadmin(loteId: string) {
    return request(servidor())
      .get(`/ingesta/registro-oficial/lotes/${loteId}`)
      .set('Authorization', await autorizacionDe('usuario-superadmin-1'));
  }

  it('superadmin ingiere un lote y crea borradores consultables', async () => {
    const respuesta = await ingerirComoSuperadmin(cuerpoLoteValido());

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.creado).toBe(true);
    expect(respuesta.body.lote.totalEntradasDetectadas).toBe(1);
    expect(respuesta.body.lote.totalConAdvertencias).toBe(0);
    expect(respuesta.body.lote).not.toHaveProperty('creadoPorUsuarioId');
    expect(respuesta.body.lote).not.toHaveProperty('fuente');
    expect(respuesta.body.lote).not.toHaveProperty('entradasDetectadas');
    expect(respuesta.body).not.toHaveProperty('items');
  });

  it('reenviar el mismo lote devuelve el resultado anterior (idempotente)', async () => {
    const primera = await ingerirComoSuperadmin(cuerpoLoteValido());
    const segunda = await ingerirComoSuperadmin(cuerpoLoteValido());

    expect(primera.status).toBe(201);
    expect(segunda.status).toBe(201);
    expect(segunda.body.creado).toBe(false);
    expect(segunda.body.lote.id).toBe(primera.body.lote.id);
    expect(segunda.body.lote).not.toHaveProperty('entradasDetectadas');
  });

  it('mismo período con payload distinto devuelve 409', async () => {
    await ingerirComoSuperadmin(cuerpoLoteValido());
    const conflicto = await ingerirComoSuperadmin(
      cuerpoLoteValido({
        entradasDetectadas: [entradaValida({ titulo: 'Otro título' })],
      }),
    );

    expect(conflicto.status).toBe(409);
    expect(conflicto.body.message).toBe('EJECUCION_INGESTA_CONFLICTIVA');
  });

  it('lote vacío devuelve 400', async () => {
    const respuesta = await ingerirComoSuperadmin(
      cuerpoLoteValido({ entradasDetectadas: [] }),
    );
    expect(respuesta.status).toBe(400);
  });

  it.each([
    '2026-02-30',
    '2026-5-2',
    '2026-05-02T00:00:00.000Z',
  ])(
    'rechaza fecha de publicación no canónica sin persistencia parcial: %s',
    async (fecha) => {
      const respuesta = await ingerirComoSuperadmin(
        cuerpoLoteValido({
          entradasDetectadas: [
            entradaValida({
              publicacion: { tipo: 'RO', numero: 500, fecha },
            }),
          ],
        }),
      );

      expect(respuesta.status).toBe(400);
      const lotes = await request(servidor())
        .get('/ingesta/registro-oficial/lotes')
        .set('Authorization', await autorizacionDe('usuario-superadmin-1'));
      expect(lotes.status).toBe(200);
      expect(lotes.body).toEqual([]);
    },
  );

  it.each(['usuario-editor-1', 'usuario-admin-1', 'usuario-suscriptor-1'])(
    '%s no puede ingerir (403)',
    async (usuarioId) => {
      const respuesta = await request(servidor())
        .post('/ingesta/registro-oficial/resumenes')
        .set('Authorization', await autorizacionDe(usuarioId))
        .send(cuerpoLoteValido());
      expect(respuesta.status).toBe(403);
      expect(respuesta.body.message).toBe('Acceso denegado');
    },
  );

  it('token de usuario inexistente recibe 403 sin pistas', async () => {
    const respuesta = await request(servidor())
      .post('/ingesta/registro-oficial/resumenes')
      .set('Authorization', await autorizacionDe('usuario-fantasma'))
      .send(cuerpoLoteValido());
    expect(respuesta.status).toBe(403);
  });

  it('sin token devuelve 401', async () => {
    const ingesta = await request(servidor())
      .post('/ingesta/registro-oficial/resumenes')
      .send(cuerpoLoteValido());
    const lotes = await request(servidor()).get(
      '/ingesta/registro-oficial/lotes',
    );

    expect(ingesta.status).toBe(401);
    expect(lotes.status).toBe(401);
  });

  it('superadmin puede consultar lotes y lote completo con entradas', async () => {
    const ingesta = await ingerirComoSuperadmin(
      cuerpoLoteValido({
        entradasDetectadas: [
          entradaValida({ posicion: 0 }),
          entradaValida({
            posicion: 1,
            numero: '456',
            advertencias: ['FILA_PDF_CORTADA'],
          }),
        ],
      }),
    );
    const loteId = ingesta.body.lote.id as string;

    const lotes = await request(servidor())
      .get('/ingesta/registro-oficial/lotes')
      .set('Authorization', await autorizacionDe('usuario-superadmin-1'));
    expect(lotes.status).toBe(200);
    expect(lotes.body).toHaveLength(1);
    expect(lotes.body[0].id).toBe(loteId);
    expect(lotes.body[0].totalConAdvertencias).toBe(1);
    expect(lotes.body[0]).not.toHaveProperty('entradasDetectadas');
    expect(lotes.body[0]).not.toHaveProperty('creadoPorUsuarioId');

    const lote = await request(servidor())
      .get(`/ingesta/registro-oficial/lotes/${loteId}`)
      .set('Authorization', await autorizacionDe('usuario-superadmin-1'));
    expect(lote.status).toBe(200);
    expect(lote.body.entradasDetectadas).toHaveLength(2);
    expect(lote.body.entradasDetectadas[1].resultadoDeteccion).toBe(
      'ENTRADA_CON_ADVERTENCIAS',
    );
  });

  it('entrada sin título no se rechaza; crea borrador con advertencia', async () => {
    const ingesta = await ingerirComoSuperadmin(
      cuerpoLoteValido({
        entradasDetectadas: [
          entradaValida({
            posicion: 0,
            titulo: '  ',
          }),
        ],
      }),
    );

    expect(ingesta.status).toBe(201);
    const lote = await consultarLoteComoSuperadmin(ingesta.body.lote.id);
    const entrada = lote.body.entradasDetectadas[0];
    expect(entrada.normaId).toBeTruthy();
    expect(entrada.advertencias).toContain('TITULO_NO_DETECTADO');
  });

  it.each(['usuario-editor-1', 'usuario-admin-1', 'usuario-suscriptor-1'])(
    '%s no puede consultar lotes ni lote completo (403): los lotes son control técnico del scraping',
    async (usuarioId) => {
      const ingesta = await ingerirComoSuperadmin(cuerpoLoteValido());
      const loteId = ingesta.body.lote.id as string;

      const lotes = await request(servidor())
        .get('/ingesta/registro-oficial/lotes')
        .set('Authorization', await autorizacionDe(usuarioId));
      const lote = await request(servidor())
        .get(`/ingesta/registro-oficial/lotes/${loteId}`)
        .set('Authorization', await autorizacionDe(usuarioId));

      expect(lotes.status).toBe(403);
      expect(lote.status).toBe(403);
    },
  );

  it('lote inexistente devuelve 404 para el superadmin', async () => {
    const respuesta = await request(servidor())
      .get('/ingesta/registro-oficial/lotes/lote-fantasma')
      .set('Authorization', await autorizacionDe('usuario-superadmin-1'));
    expect(respuesta.status).toBe(404);
  });

  it('los borradores creados por ingesta llegan a la lista editorial sin placeholders', async () => {
    const ingesta = await ingerirComoSuperadmin(
      cuerpoLoteValido({
        entradasDetectadas: [
          entradaValida({
            posicion: 0,
            titulo: '  ',
            tipo: null,
            institucion: null,
          }),
        ],
      }),
    );
    expect(ingesta.status).toBe(201);
    const lote = await consultarLoteComoSuperadmin(ingesta.body.lote.id);
    const normaId = lote.body.entradasDetectadas[0].normaId as string;

    const lista = await request(servidor())
      .get('/normas?estadoEditorial=BORRADOR')
      .set('Authorization', await autorizacionDe('usuario-editor-1'));
    expect(lista.status).toBe(200);
    expect(Array.isArray(lista.body)).toBe(true);
    const norma = lista.body.find(
      (elemento: { id: string }) => elemento.id === normaId,
    );
    expect(norma).toBeDefined();
    // Sin placeholders y sin fallback de fuente: la URL del resumen mensual
    // no se copia a la fuente de la norma.
    expect(norma.titulo).toBe('');
    expect(norma.tipoNorma).toBe('');
    expect(norma.institucionExpide).toBe('');
    expect(norma.edicionesRegistroOficial).toEqual([
      expect.objectContaining({
        tipoRelacion: 'PRINCIPAL',
        tipoPublicacionRegistroOficial: 'RO',
        numeroPublicacionRegistroOficial: 500,
        fechaPublicacionOficial: '2026-05-02',
        fuente: null,
      }),
    ]);
    expect(norma).not.toHaveProperty('edicionRegistroOficialId');
    expect(norma).not.toHaveProperty('fuente');
    expect(norma.estadoJuridico).toBe('VIGENTE');
    expect(norma.origenRegistroOficial).toEqual({
      urlResumenMensualRegistroOficial:
        'https://www.registroficial.gob.ec/resumen-2026-05.pdf',
      segmentoCrudo: 'Acuerdo Ministerial 123: disposición de prueba',
    });
    expect(norma).not.toHaveProperty('advertencias');
    expect(norma).not.toHaveProperty('metadataExtraccion');
  });

  it('el detalle editorial incluye origenRegistroOficial para verificar la detección', async () => {
    const ingesta = await ingerirComoSuperadmin(cuerpoLoteValido());
    const lote = await consultarLoteComoSuperadmin(ingesta.body.lote.id);
    const normaId = lote.body.entradasDetectadas[0].normaId as string;

    const detalle = await request(servidor())
      .get(`/normas/${normaId}`)
      .set('Authorization', await autorizacionDe('usuario-editor-1'));

    expect(detalle.status).toBe(200);
    expect(detalle.body.id).toBe(normaId);
    expect(detalle.body.edicionesRegistroOficial).toEqual([
      expect.objectContaining({
        tipoRelacion: 'PRINCIPAL',
        fuente: null,
      }),
    ]);
    expect(detalle.body).not.toHaveProperty('fuente');
    expect(detalle.body.origenRegistroOficial).toEqual({
      urlResumenMensualRegistroOficial:
        'https://www.registroficial.gob.ec/resumen-2026-05.pdf',
      segmentoCrudo: 'Acuerdo Ministerial 123: disposición de prueba',
    });
    expect(detalle.body).not.toHaveProperty('metadataExtraccion');
  });

  it('rechaza propiedades ajenas al contrato del extractor', async () => {
    const respuesta = await ingerirComoSuperadmin(
      cuerpoLoteValido({
        entradasDetectadas: [
          entradaValida({ propiedadAjena: ['titulo'] }),
        ],
      }),
    );

    expect(respuesta.status).toBe(400);
  });

  it('rechaza anio dentro de una entrada porque el período pertenece al lote', async () => {
    const respuesta = await ingerirComoSuperadmin(
      cuerpoLoteValido({
        entradasDetectadas: [entradaValida({ anio: 2026 })],
      }),
    );

    expect(respuesta.status).toBe(400);
  });
});
