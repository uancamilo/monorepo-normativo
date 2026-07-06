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
// Se monta NormasModule (memoria) directamente en vez de AppModule para que
// este e2e no dependa de la variable PERSISTENCIA del entorno; el selector de
// módulo tiene su propio test (seleccionar-modulo-normas.test.ts).
import { NormasModule } from '../normas/normas.module';
import { TOKEN_PUBLICADOR_EVENTOS } from '../normas/tokens';
import { PublicadorEventosNormasEnMemoria } from '../memoria/PublicadorEventosNormasEnMemoria';
import { ServicioTokens } from '../autenticacion/servicio-tokens';

const USUARIO_EDITOR = 'usuario-editor-1';
const USUARIO_SUPERADMIN = 'usuario-superadmin-1';
const USUARIO_ADMIN = 'usuario-admin-1';
const USUARIO_SUSCRIPTOR = 'usuario-suscriptor-1';

function cuerpoNormaValido(overrides: Record<string, unknown> = {}) {
  return {
    numero: '123',
    titulo: 'Ley Orgánica de Prueba',
    contenido: '',
    tipoNorma: 'Ley',
    institucionExpide: 'Asamblea Nacional',
    fuente: 'https://www.registroficial.gob.ec/norma.pdf',
    estadoJuridico: 'VIGENTE',
    fechaExpedicion: '2025-01-01',
    fechaPublicacionOficial: '2025-01-02',
    ...overrides,
  };
}

describe('Normas (e2e)', () => {
  let app: INestApplication;
  let servicioTokens: ServicioTokens;
  const tokens = new Map<string, string>();

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [NormasModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    // ServicioTokens real de la app: los tokens de test se firman con el mismo
    // secreto que verifica el guard, esté o no definido JWT_SECRET en el entorno.
    servicioTokens = app.get(ServicioTokens);
  });

  afterEach(async () => {
    await app.close();
  });

  function servidor() {
    return app.getHttpServer();
  }

  async function autorizacionDe(
    usuarioId: string,
    opciones: { rol?: string } = {},
  ): Promise<string> {
    if (opciones.rol !== undefined) {
      // Sin cache: token especial solo para el test que lo pide.
      const token = await servicioTokens.firmar({ usuarioId, rol: opciones.rol });
      return `Bearer ${token}`;
    }

    // El secreto no cambia entre apps del mismo proceso, así que el cache por
    // usuario es seguro aunque la app se recree en cada test.
    let token = tokens.get(usuarioId);
    if (token === undefined) {
      token = await servicioTokens.firmar({ usuarioId });
      tokens.set(usuarioId, token);
    }
    return `Bearer ${token}`;
  }

  async function registrarComoEditor(overrides: Record<string, unknown> = {}) {
    const respuesta = await request(servidor())
      .post('/normas')
      .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
      .send(cuerpoNormaValido(overrides));
    return respuesta;
  }

  it('flujo feliz: registrar -> publicar -> consultar', async () => {
    const registro = await registrarComoEditor();
    expect(registro.status).toBe(201);
    expect(registro.body.id).toBe('norma-1');
    expect(registro.body.estadoEditorial).toBe('BORRADOR');
    expect(registro.body.estadoJuridico).toBe('VIGENTE');
    expect(registro.body.tieneContenidoCompleto).toBe(false);

    const publicacion = await request(servidor())
      .post('/normas/norma-1/publicar')
      .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
      .send({ fechaPublicacionEnSistema: '2026-06-29T00:00:00.000Z' });
    expect(publicacion.status).toBe(200);
    expect(publicacion.body.id).toBe('norma-1');
    expect(publicacion.body.estadoEditorial).toBe('PUBLICADA');
    expect(publicacion.body.fechaPublicacionEnSistema).toBe(
      '2026-06-29T00:00:00.000Z',
    );
    expect(publicacion.body.tieneContenidoCompleto).toBe(false);

    const consulta = await request(servidor())
      .get('/normas/norma-1/contenido')
      .set('Authorization', await autorizacionDe(USUARIO_SUSCRIPTOR));
    expect(consulta.status).toBe(200);
    expect(consulta.body.id).toBe('norma-1');
    expect(consulta.body.titulo).toBe('Ley Orgánica de Prueba');
    expect(consulta.body.tieneContenidoCompleto).toBe(false);
    expect(consulta.body.fuente).toBe(
      'https://www.registroficial.gob.ec/norma.pdf',
    );
    expect(consulta.body).not.toHaveProperty('fechaPublicacionEnSistema');
    expect(consulta.body).not.toHaveProperty('estadoEditorial');
  });

  it('SUPERADMINISTRADOR puede registrar', async () => {
    const respuesta = await request(servidor())
      .post('/normas')
      .set('Authorization', await autorizacionDe(USUARIO_SUPERADMIN))
      .send(cuerpoNormaValido());
    expect(respuesta.status).toBe(201);
    expect(respuesta.body.estadoEditorial).toBe('BORRADOR');
  });

  it('ADMINISTRADOR no puede registrar (403)', async () => {
    const respuesta = await request(servidor())
      .post('/normas')
      .set('Authorization', await autorizacionDe(USUARIO_ADMIN))
      .send(cuerpoNormaValido());
    expect(respuesta.status).toBe(403);
  });

  it('SUSCRIPTOR no puede registrar (403)', async () => {
    const respuesta = await request(servidor())
      .post('/normas')
      .set('Authorization', await autorizacionDe(USUARIO_SUSCRIPTOR))
      .send(cuerpoNormaValido());
    expect(respuesta.status).toBe(403);
  });

  it('ADMINISTRADOR no puede publicar (403)', async () => {
    await registrarComoEditor();
    const respuesta = await request(servidor())
      .post('/normas/norma-1/publicar')
      .set('Authorization', await autorizacionDe(USUARIO_ADMIN))
      .send({});
    expect(respuesta.status).toBe(403);
  });

  it('SUSCRIPTOR no puede publicar (403)', async () => {
    await registrarComoEditor();
    const respuesta = await request(servidor())
      .post('/normas/norma-1/publicar')
      .set('Authorization', await autorizacionDe(USUARIO_SUSCRIPTOR))
      .send({});
    expect(respuesta.status).toBe(403);
  });

  it('SUPERADMINISTRADOR puede publicar', async () => {
    await registrarComoEditor();
    const respuesta = await request(servidor())
      .post('/normas/norma-1/publicar')
      .set('Authorization', await autorizacionDe(USUARIO_SUPERADMIN))
      .send({});
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.estadoEditorial).toBe('PUBLICADA');
  });

  it('consulta sin suscripción habilitada devuelve 403 (acceso no depende del rol)', async () => {
    await registrarComoEditor();
    await request(servidor())
      .post('/normas/norma-1/publicar')
      .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
      .send({});

    // editor@test.com no está habilitado en la suscripción semilla.
    const consulta = await request(servidor())
      .get('/normas/norma-1/contenido')
      .set('Authorization', await autorizacionDe(USUARIO_EDITOR));
    expect(consulta.status).toBe(403);
  });

  it('norma en BORRADOR no es consultable (403)', async () => {
    await registrarComoEditor();
    const consulta = await request(servidor())
      .get('/normas/norma-1/contenido')
      .set('Authorization', await autorizacionDe(USUARIO_SUSCRIPTOR));
    expect(consulta.status).toBe(403);
  });

  it('sin token devuelve 401', async () => {
    const respuesta = await request(servidor())
      .post('/normas')
      .send(cuerpoNormaValido());
    expect(respuesta.status).toBe(401);
  });

  it('token inválido devuelve 401', async () => {
    const respuesta = await request(servidor())
      .post('/normas')
      .set('Authorization', 'Bearer token-invalido')
      .send(cuerpoNormaValido());
    expect(respuesta.status).toBe(401);
  });

  it('el header legacy x-usuario-id ya no autentica (401)', async () => {
    const respuesta = await request(servidor())
      .post('/normas')
      .set('x-usuario-id', USUARIO_EDITOR)
      .send(cuerpoNormaValido());
    expect(respuesta.status).toBe(401);
  });

  it('no concede permisos por el rol informativo del token', async () => {
    // Token válido con rol EDITOR falsificado, pero el sub es el ADMINISTRADOR
    // semilla: los permisos salen del Usuario del repositorio, no del claim.
    const respuesta = await request(servidor())
      .post('/normas')
      .set('Authorization', await autorizacionDe(USUARIO_ADMIN, { rol: 'EDITOR' }))
      .send(cuerpoNormaValido());
    expect(respuesta.status).toBe(403);
  });

  it('token válido de usuario inexistente devuelve 401', async () => {
    const respuesta = await request(servidor())
      .post('/normas')
      .set('Authorization', await autorizacionDe('usuario-fantasma'))
      .send(cuerpoNormaValido());
    expect(respuesta.status).toBe(401);
  });

  it('solicitud inválida (título vacío) devuelve 400', async () => {
    const respuesta = await request(servidor())
      .post('/normas')
      .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
      .send(cuerpoNormaValido({ titulo: '' }));
    expect(respuesta.status).toBe(400);
  });

  it('publicar norma inexistente devuelve 404', async () => {
    const respuesta = await request(servidor())
      .post('/normas/norma-inexistente/publicar')
      .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
      .send({});
    expect(respuesta.status).toBe(404);
  });

  it('publicar dos veces la misma norma devuelve 409', async () => {
    await registrarComoEditor();
    await request(servidor())
      .post('/normas/norma-1/publicar')
      .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
      .send({});
    const segunda = await request(servidor())
      .post('/normas/norma-1/publicar')
      .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
      .send({});
    expect(segunda.status).toBe(409);
  });

  it('al publicar se registra exactamente un evento', async () => {
    // Norma registrada con contenido vacío (cuerpoNormaValido usa contenido '').
    await registrarComoEditor();
    await request(servidor())
      .post('/normas/norma-1/publicar')
      .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
      .send({ fechaPublicacionEnSistema: '2026-06-29T00:00:00.000Z' });

    const publicador = app.get<PublicadorEventosNormasEnMemoria>(
      TOKEN_PUBLICADOR_EVENTOS,
    );
    expect(publicador.eventos).toHaveLength(1);
    const evento = publicador.eventos[0];
    expect(evento.normaId).toBe('norma-1');
    expect(evento.fechaPublicacionEnSistema).toEqual(
      new Date('2026-06-29T00:00:00.000Z'),
    );
    expect(evento.tieneContenidoCompleto).toBe(false);
  });
});
