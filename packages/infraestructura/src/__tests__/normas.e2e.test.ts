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
import { RepositorioEdicionesRegistroOficial } from '@normativo/aplicacion';
import { EstadoResolucionFuente } from '@normativo/dominio';
import request from 'supertest';
// Se montan NormasModule + AuthModule (memoria) directamente en vez de
// AppModule para que este e2e no dependa de la variable PERSISTENCIA del
// entorno; el selector de módulo tiene su propio test
// (seleccionar-modulo-normas.test.ts).
import { NormasModule } from '../normas/normas.module';
import { AuthModule } from '../autenticacion/http/auth.module';
import {
  TOKEN_PUBLICADOR_EVENTOS,
  TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
} from '../normas/tokens';
import { PublicadorEventosNormasEnMemoria } from '../memoria/PublicadorEventosNormasEnMemoria';
import { ServicioTokens } from '../autenticacion/servicio-tokens';
import { CONTRASENA_SEMILLA } from '../memoria/RepositorioCredencialesUsuariosEnMemoria';

const USUARIO_EDITOR = 'usuario-editor-1';
const USUARIO_SUPERADMIN = 'usuario-superadmin-1';
const USUARIO_ADMIN = 'usuario-admin-1';
const USUARIO_SUSCRIPTOR = 'usuario-suscriptor-1';

// Correos de los usuarios semilla para obtener tokens mediante login real.
const CORREOS_SEMILLA: Record<string, string> = {
  [USUARIO_EDITOR]: 'editor@test.com',
  [USUARIO_SUPERADMIN]: 'superadmin@test.com',
  [USUARIO_ADMIN]: 'admin@test.com',
  [USUARIO_SUSCRIPTOR]: 'suscriptor@test.com',
};

function cuerpoNormaValido(overrides: Record<string, unknown> = {}) {
  return {
    numero: '123',
    titulo: 'Ley Orgánica de Prueba',
    contenido: [],
    tipoNorma: 'Ley',
    institucionExpide: 'Asamblea Nacional',
    estadoJuridico: 'VIGENTE',
    fechaExpedicion: '2025-01-01',
    fechaPublicacionOficial: '2025-01-02',
    tipoPublicacionRegistroOficial: 'RO',
    numeroPublicacionRegistroOficial: 500,
    ...overrides,
  };
}

describe('Normas (e2e)', () => {
  let app: INestApplication;
  let servicioTokens: ServicioTokens;
  const tokens = new Map<string, string>();

  beforeEach(async () => {
    tokens.clear();

    const moduleRef = await Test.createTestingModule({
      imports: [NormasModule, AuthModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    // ServicioTokens real de la app: solo para los casos que el login no puede
    // producir (usuario inexistente, rol falsificado en el claim).
    servicioTokens = app.get(ServicioTokens);

    // Reset adapters en memoria (no de IDs): cada test comienza con estado limpio
    const publicadorEventos = app.get<PublicadorEventosNormasEnMemoria>(
      TOKEN_PUBLICADOR_EVENTOS,
    );
    if (publicadorEventos) (publicadorEventos as any)._eventos = [];
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  function servidor() {
    return app.getHttpServer();
  }

  async function autorizacionDe(
    usuarioId: string,
    opciones: { rol?: string } = {},
  ): Promise<string> {
    if (opciones.rol !== undefined) {
      // Token con claim de rol falsificado: el login real nunca lo emitiría,
      // se firma directo solo para el test que lo pide. Sin cache.
      const token = await servicioTokens.firmar({ usuarioId, rol: opciones.rol });
      return `Bearer ${token}`;
    }

    const correo = CORREOS_SEMILLA[usuarioId];
    if (correo === undefined) {
      // Usuario sin credenciales semilla (p. ej. inexistente): token firmado
      // directo, imposible de obtener por login.
      const token = await servicioTokens.firmar({ usuarioId });
      return `Bearer ${token}`;
    }

    // Flujo real de Fase 4B/4C: el token sale de POST /auth/login. El cache
    // solo evita repetir el login dentro de un mismo test y se limpia cuando
    // se crea una nueva instancia de la aplicación.
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

  async function registrarComoEditor(overrides: Record<string, unknown> = {}) {
    const respuesta = await request(servidor())
      .post('/normas')
      .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
      .send(cuerpoNormaValido(overrides));
    return respuesta;
  }

  async function registrarYObtenerNorma(overrides: Record<string, unknown> = {}) {
    const respuesta = await registrarComoEditor(overrides);
    expect(respuesta.status).toBe(201);
    return respuesta.body;
  }

  function edicionPrincipalDe(respuestaNorma: any) {
    expect(respuestaNorma.edicionesRegistroOficial).toEqual(expect.any(Array));
    const principal = respuestaNorma.edicionesRegistroOficial.find(
      (edicion: { tipoRelacion: string }) => edicion.tipoRelacion === 'PRINCIPAL',
    );
    expect(principal).toBeDefined();
    return principal;
  }

  async function establecerFuentesPendientesManualmente() {
    const repositorio = app.get<RepositorioEdicionesRegistroOficial>(
      TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
    );
    const pendientes = await repositorio.listarPorEstadoResolucionFuente([
      EstadoResolucionFuente.PENDIENTE,
    ]);
    for (const edicion of pendientes) {
      await repositorio.guardar(
        edicion.corregirFuenteManualmente(
          `https://www.registroficial.gob.ec/ediciones/${edicion.id}.pdf`,
        ),
      );
    }
  }

  async function registrarMultiplesNormas(
    cantidad: number,
    overridesArray: Record<string, unknown>[] = [],
  ) {
    const normas = [];
    for (let i = 0; i < cantidad; i++) {
      const respuesta = await registrarComoEditor(overridesArray[i] || {});
      if (respuesta.status !== 201) {
        throw new Error(
          `Registro ${i + 1} falló con status ${respuesta.status}: ${JSON.stringify(respuesta.body)}`,
        );
      }
      normas.push(respuesta.body);
    }
    return normas;
  }

  async function actualizarYObtenerNorma(
    normaId: string,
    actualizaciones: Record<string, unknown>,
  ) {
    const respuesta = await request(servidor())
      .patch(`/normas/${normaId}`)
      .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
      .send(actualizaciones);
    return respuesta;
  }

  async function crearEdicionManual(
    overrides: Record<string, unknown> = {},
  ) {
    return request(servidor())
      .post('/ediciones-registro-oficial')
      .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
      .send({
        tipoPublicacionRegistroOficial: 'SRO',
        numeroPublicacionRegistroOficial: 600,
        fechaPublicacionOficial: '2026-06-02',
        urlPdf:
          'https://www.registroficial.gob.ec/ediciones/sro-600-manual.pdf',
        ...overrides,
      });
  }

  it('flujo feliz: registrar -> resolver fuente -> publicar -> consultar', async () => {
    const registro = await registrarComoEditor();
    expect(registro.status).toBe(201);
    const normaId = registro.body.id;
    expect(registro.body.estadoEditorial).toBe('BORRADOR');
    expect(registro.body.estadoJuridico).toBe('VIGENTE');
    expect(registro.body.tieneContenidoCompleto).toBe(false);

    await establecerFuentesPendientesManualmente();

    const publicacion = await request(servidor())
      .post(`/normas/${normaId}/publicar`)
      .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
      .send({ fechaPublicacionEnSistema: '2026-06-29T00:00:00.000Z' });
    expect(publicacion.status).toBe(200);
    expect(publicacion.body.id).toBe(normaId);
    expect(publicacion.body.estadoEditorial).toBe('PUBLICADA');
    expect(publicacion.body.fechaPublicacionEnSistema).toBe(
      '2026-06-29T00:00:00.000Z',
    );
    expect(publicacion.body.tieneContenidoCompleto).toBe(false);

    const consulta = await request(servidor())
      .get(`/normas/${normaId}/contenido`)
      .set('Authorization', await autorizacionDe(USUARIO_SUSCRIPTOR));
    expect(consulta.status).toBe(200);
    expect(consulta.body.id).toBe(normaId);
    expect(consulta.body.titulo).toBe('Ley Orgánica de Prueba');
    expect(consulta.body.tieneContenidoCompleto).toBe(false);
    expect(edicionPrincipalDe(consulta.body).fuente).toBeTruthy();
    expect(consulta.body).not.toHaveProperty('fuente');
    expect(consulta.body).not.toHaveProperty('edicionRegistroOficialId');
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

  it.each([
    '2026-02-30',
    '2026-5-2',
    '2026-05-02T00:00:00.000Z',
  ])(
    'POST /normas rechaza fechaPublicacionOficial no canónica: %s',
    async (fechaPublicacionOficial) => {
      const respuesta = await registrarComoEditor({
        fechaPublicacionOficial,
      });

      expect(respuesta.status).toBe(400);
      const listado = await request(servidor())
        .get('/normas?estadoEditorial=BORRADOR')
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR));
      expect(listado.status).toBe(200);
      expect(listado.body).toEqual([]);
    },
  );

  it.each(['2026-02-30', '2026-5-2', '2025-01-01T10:00:00.000Z'])(
    'POST /normas rechaza fechaExpedicion no canónica: %s',
    async (fechaExpedicion) => {
      const respuesta = await registrarComoEditor({ fechaExpedicion });

      expect(respuesta.status).toBe(400);
    },
  );

  it('POST /normas acepta fechaExpedicion null', async () => {
    const respuesta = await registrarComoEditor({ fechaExpedicion: null });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.estadoEditorial).toBe('BORRADOR');
  });

  it('PATCH /normas/:id rechaza fechaExpedicion con hora', async () => {
    const norma = await registrarYObtenerNorma();

    const respuesta = await actualizarYObtenerNorma(norma.id, {
      fechaExpedicion: '2025-01-01T10:00:00.000Z',
    });

    expect(respuesta.status).toBe(400);
  });

  it('la vista de detalle editorial proyecta fechaExpedicion como YYYY-MM-DD', async () => {
    const norma = await registrarYObtenerNorma({ fechaExpedicion: '2025-01-01' });

    const detalle = await request(servidor())
      .get(`/normas/${norma.id}`)
      .set('Authorization', await autorizacionDe(USUARIO_EDITOR));

    expect(detalle.status).toBe(200);
    expect(detalle.body.fechaExpedicion).toBe('2025-01-01');
  });

  it('ADMINISTRADOR no puede publicar (403)', async () => {
    const norma = await registrarYObtenerNorma();
    const respuesta = await request(servidor())
      .post(`/normas/${norma.id}/publicar`)
      .set('Authorization', await autorizacionDe(USUARIO_ADMIN))
      .send({});
    expect(respuesta.status).toBe(403);
  });

  it('SUSCRIPTOR no puede publicar (403)', async () => {
    const norma = await registrarYObtenerNorma();
    const respuesta = await request(servidor())
      .post(`/normas/${norma.id}/publicar`)
      .set('Authorization', await autorizacionDe(USUARIO_SUSCRIPTOR))
      .send({});
    expect(respuesta.status).toBe(403);
  });

  it('SUPERADMINISTRADOR puede publicar', async () => {
    const norma = await registrarYObtenerNorma();
    await establecerFuentesPendientesManualmente();
    const respuesta = await request(servidor())
      .post(`/normas/${norma.id}/publicar`)
      .set('Authorization', await autorizacionDe(USUARIO_SUPERADMIN))
      .send({});
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.estadoEditorial).toBe('PUBLICADA');
  });

  it('consulta sin suscripción habilitada devuelve 403 (acceso no depende del rol)', async () => {
    const norma = await registrarYObtenerNorma();
    await establecerFuentesPendientesManualmente();
    await request(servidor())
      .post(`/normas/${norma.id}/publicar`)
      .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
      .send({});

    const consulta = await request(servidor())
      .get(`/normas/${norma.id}/contenido`)
      .set('Authorization', await autorizacionDe(USUARIO_EDITOR));
    expect(consulta.status).toBe(403);
  });

  it('los 403 de causas distintas devuelven el mismo cuerpo genérico', async () => {
    const norma = await registrarYObtenerNorma();
    await request(servidor())
      .post(`/normas/${norma.id}/publicar`)
      .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
      .send({});

    const porPermiso = await request(servidor())
      .post('/normas')
      .set('Authorization', await autorizacionDe(USUARIO_ADMIN))
      .send(cuerpoNormaValido());
    const porSuscripcion = await request(servidor())
      .get(`/normas/${norma.id}/contenido`)
      .set('Authorization', await autorizacionDe(USUARIO_EDITOR));

    expect(porPermiso.status).toBe(403);
    expect(porSuscripcion.status).toBe(403);
    expect(porPermiso.body.message).toBe('Acceso denegado');
    expect(porPermiso.body).toEqual(porSuscripcion.body);
  });

  it('ningún rol global obtiene contenido sin suscripción habilitada (403)', async () => {
    const norma = await registrarYObtenerNorma();
    await request(servidor())
      .post(`/normas/${norma.id}/publicar`)
      .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
      .send({});

    for (const usuario of [USUARIO_ADMIN, USUARIO_SUPERADMIN]) {
      const consulta = await request(servidor())
        .get(`/normas/${norma.id}/contenido`)
        .set('Authorization', await autorizacionDe(usuario));
      expect(consulta.status).toBe(403);
    }
  });

  it('norma en BORRADOR no es consultable (403)', async () => {
    const norma = await registrarYObtenerNorma();
    const consulta = await request(servidor())
      .get(`/normas/${norma.id}/contenido`)
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

  it('Authorization con formato incorrecto devuelve 401', async () => {
    const autorizacionValida = await autorizacionDe(USUARIO_EDITOR);
    const tokenValido = autorizacionValida.replace('Bearer ', '');

    const esquemaBasic = await request(servidor())
      .post('/normas')
      .set('Authorization', `Basic ${tokenValido}`)
      .send(cuerpoNormaValido());
    const tokenPelado = await request(servidor())
      .post('/normas')
      .set('Authorization', tokenValido)
      .send(cuerpoNormaValido());
    const bearerVacio = await request(servidor())
      .post('/normas')
      .set('Authorization', 'Bearer')
      .send(cuerpoNormaValido());

    expect(esquemaBasic.status).toBe(401);
    expect(tokenPelado.status).toBe(401);
    expect(bearerVacio.status).toBe(401);
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

  it('el rol falsificado en el token tampoco permite publicar', async () => {
    const norma = await registrarYObtenerNorma();
    const respuesta = await request(servidor())
      .post(`/normas/${norma.id}/publicar`)
      .set('Authorization', await autorizacionDe(USUARIO_ADMIN, { rol: 'EDITOR' }))
      .send({});
    expect(respuesta.status).toBe(403);
  });

  it('un claim rol degradado tampoco altera lo que decide el caso de uso', async () => {
    // EDITOR real con claim rol SUSCRIPTOR falsificado: sigue pudiendo
    // registrar porque la autorización usa el Usuario del repositorio.
    const respuesta = await request(servidor())
      .post('/normas')
      .set(
        'Authorization',
        await autorizacionDe(USUARIO_EDITOR, { rol: 'SUSCRIPTOR' }),
      )
      .send(cuerpoNormaValido());
    expect(respuesta.status).toBe(201);
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

  it('publicar dos veces la misma norma devuelve 409 NORMA_YA_PUBLICADA', async () => {
    const norma = await registrarYObtenerNorma();
    await establecerFuentesPendientesManualmente();
    const primera = await request(servidor())
      .post(`/normas/${norma.id}/publicar`)
      .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
      .send({});
    expect(primera.status).toBe(200);
    const segunda = await request(servidor())
      .post(`/normas/${norma.id}/publicar`)
      .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
      .send({});
    expect(segunda.status).toBe(409);
    expect(segunda.body.message).toBe('NORMA_YA_PUBLICADA');
  });

  it('dos publicaciones concurrentes: un 200 y un 409 NORMA_YA_PUBLICADA, nunca 500', async () => {
    const norma = await registrarYObtenerNorma();
    await establecerFuentesPendientesManualmente();
    const autorizacion = await autorizacionDe(USUARIO_EDITOR);

    const respuestas = await Promise.all([
      request(servidor())
        .post(`/normas/${norma.id}/publicar`)
        .set('Authorization', autorizacion)
        .send({}),
      request(servidor())
        .post(`/normas/${norma.id}/publicar`)
        .set('Authorization', autorizacion)
        .send({}),
    ]);

    const estados = respuestas.map((respuesta) => respuesta.status).sort();
    expect(estados).toEqual([200, 409]);
    const conflicto = respuestas.find((respuesta) => respuesta.status === 409);
    expect(conflicto?.body.message).toBe('NORMA_YA_PUBLICADA');

    // Un solo evento de publicación registrado.
    const publicadorEventos = app.get<PublicadorEventosNormasEnMemoria>(
      TOKEN_PUBLICADOR_EVENTOS,
    );
    expect(
      publicadorEventos.eventos.filter(
        (evento) => evento.normaId === norma.id,
      ),
    ).toHaveLength(1);
  });

  describe('lista editorial GET /normas', () => {
    it.each([USUARIO_EDITOR, USUARIO_SUPERADMIN])(
      '%s consulta los borradores como array estándar sin total',
      async (usuarioId) => {
        const normaRegistrada = await registrarYObtenerNorma();
        const respuesta = await request(servidor())
          .get('/normas?estadoEditorial=BORRADOR')
          .set('Authorization', await autorizacionDe(usuarioId));

        expect(respuesta.status).toBe(200);
        expect(Array.isArray(respuesta.body)).toBe(true);
        expect(respuesta.body).toHaveLength(1);
        expect(respuesta.body[0]).toMatchObject({
          id: normaRegistrada.id,
          estadoEditorial: 'BORRADOR',
          estadoJuridico: 'VIGENTE',
          tipoNorma: 'Ley',
          numero: '123',
          titulo: 'Ley Orgánica de Prueba',
          institucionExpide: 'Asamblea Nacional',
          fechaExpedicion: '2025-01-01',
          edicionesRegistroOficial: [
            {
              tipoRelacion: 'PRINCIPAL',
              id: edicionPrincipalDe(normaRegistrada).id,
              fechaPublicacionOficial: '2025-01-02',
              tipoPublicacionRegistroOficial: 'RO',
              numeroPublicacionRegistroOficial: 500,
              fuente: null,
            },
          ],
          estadoResolucionFuente: 'PENDIENTE',
        });
        for (const campoSingular of [
          'edicionRegistroOficialId',
          'fuente',
          'fechaPublicacionOficial',
          'tipoPublicacionRegistroOficial',
          'numeroPublicacionRegistroOficial',
        ]) {
          expect(respuesta.body[0]).not.toHaveProperty(campoSingular);
        }
      },
    );

    it('el filtro BORRADOR excluye normas publicadas', async () => {
      const norma1 = await registrarYObtenerNorma();
      await establecerFuentesPendientesManualmente();
      await request(servidor())
        .post(`/normas/${norma1.id}/publicar`)
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
        .send({});
      const norma2 = await registrarYObtenerNorma({ titulo: 'Otra norma en borrador' });

      const respuesta = await request(servidor())
        .get('/normas?estadoEditorial=BORRADOR')
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR));

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toHaveLength(1);
      expect(respuesta.body[0].id).toBe(norma2.id);
      expect(respuesta.body[0].titulo).toBe('Otra norma en borrador');
    });

    it.each([USUARIO_ADMIN, USUARIO_SUSCRIPTOR])(
      '%s no puede consultar la lista editorial (403)',
      async (usuarioId) => {
        const respuesta = await request(servidor())
          .get('/normas?estadoEditorial=BORRADOR')
          .set('Authorization', await autorizacionDe(usuarioId));
        expect(respuesta.status).toBe(403);
      },
    );

    it('sin token devuelve 401', async () => {
      const respuesta = await request(servidor()).get(
        '/normas?estadoEditorial=BORRADOR',
      );
      expect(respuesta.status).toBe(401);
    });

    it('estadoEditorial inválido devuelve 400', async () => {
      const respuesta = await request(servidor())
        .get('/normas?estadoEditorial=INVENTADO')
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR));
      expect(respuesta.status).toBe(400);
    });
  });

  describe('detalle editorial GET /normas/:id', () => {
    it.each([USUARIO_EDITOR, USUARIO_SUPERADMIN])(
      '%s consulta el detalle de un borrador con contenido',
      async (usuarioId) => {
        const norma = await registrarYObtenerNorma();
        const edicionPrincipal = edicionPrincipalDe(norma);
        const respuesta = await request(servidor())
          .get(`/normas/${norma.id}`)
          .set('Authorization', await autorizacionDe(usuarioId));

        expect(respuesta.status).toBe(200);
        expect(respuesta.body.id).toBe(norma.id);
        expect(respuesta.body.contenido).toEqual([]);
        expect(respuesta.body.estadoResolucionFuente).toBe('PENDIENTE');
        expect(respuesta.body).not.toHaveProperty('origenRegistroOficial');
      },
    );

    it.each([USUARIO_EDITOR, USUARIO_SUPERADMIN])(
      '%s consulta una PUBLICADA con origen pero sin estadoResolucionFuente',
      async (usuarioId) => {
        const norma = await registrarYObtenerNorma();
        await establecerFuentesPendientesManualmente();
        const publicacion = await request(servidor())
          .post(`/normas/${norma.id}/publicar`)
          .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
          .send({});
        expect(publicacion.status).toBe(200);

        const respuesta = await request(servidor())
          .get(`/normas/${norma.id}`)
          .set('Authorization', await autorizacionDe(usuarioId));

        expect(respuesta.status).toBe(200);
        expect(respuesta.body.estadoEditorial).toBe('PUBLICADA');
        expect(respuesta.body).not.toHaveProperty('estadoResolucionFuente');
      },
    );

    it.each([USUARIO_ADMIN, USUARIO_SUSCRIPTOR])(
      '%s no puede consultar el detalle editorial (403)',
      async (usuarioId) => {
        const norma = await registrarYObtenerNorma();
        const respuesta = await request(servidor())
          .get(`/normas/${norma.id}`)
          .set('Authorization', await autorizacionDe(usuarioId));
        expect(respuesta.status).toBe(403);
      },
    );

    it('norma inexistente devuelve 404', async () => {
      const respuesta = await request(servidor())
        .get('/normas/norma-fantasma')
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR));
      expect(respuesta.status).toBe(404);
    });
  });

  describe('catálogo editorial de ediciones del Registro Oficial', () => {
    it.each([
      '2026-02-30',
      '2026-5-2',
      '2026-05-02T00:00:00.000Z',
    ])(
      'rechaza fechaPublicacionOficial no canónica sin crear edición: %s',
      async (fechaPublicacionOficial) => {
        const respuesta = await crearEdicionManual({
          fechaPublicacionOficial,
        });

        expect(respuesta.status).toBe(400);
        const listado = await request(servidor())
          .get('/ediciones-registro-oficial')
          .set('Authorization', await autorizacionDe(USUARIO_EDITOR));
        expect(listado.status).toBe(200);
        expect(listado.body).toEqual([]);
      },
    );

    it('crear manualmente una triple existente devuelve 409 sin sobrescribir su fuente', async () => {
      const primera = await crearEdicionManual();
      expect(primera.status).toBe(201);

      const duplicada = await crearEdicionManual({
        urlPdf:
          'https://www.registroficial.gob.ec/ediciones/no-debe-sobrescribir.pdf',
      });

      expect(duplicada.status).toBe(409);
      expect(duplicada.body.message).toBe('EDICION_YA_EXISTE');

      const detalle = await request(servidor())
        .get(`/ediciones-registro-oficial/${primera.body.id}`)
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR));
      expect(detalle.status).toBe(200);
      expect(detalle.body.urlPdf).toBe(
        'https://www.registroficial.gob.ec/ediciones/sro-600-manual.pdf',
      );
      expect(detalle.body.estadoResolucionFuente).toBe('MANUAL');
    });

    it.each([USUARIO_EDITOR, USUARIO_SUPERADMIN])(
      '%s lista el catálogo sin exponer datos técnicos de ingesta',
      async (usuarioId) => {
        const norma = await registrarYObtenerNorma();
        const edicionPrincipal = edicionPrincipalDe(norma);
        const respuesta = await request(servidor())
          .get('/ediciones-registro-oficial')
          .set('Authorization', await autorizacionDe(usuarioId));

        expect(respuesta.status).toBe(200);
        expect(respuesta.body).toHaveLength(1);
        expect(respuesta.body[0]).toEqual({
          id: edicionPrincipal.id,
          tipoPublicacionRegistroOficial: 'RO',
          numeroPublicacionRegistroOficial: 500,
          fechaPublicacionOficial: '2025-01-02',
          urlPdf: null,
          estadoResolucionFuente: 'PENDIENTE',
        });
        for (const campo of [
          'segmentoCrudo',
          'loteId',
          'metadataExtraccion',
          'urlResumenMensualRegistroOficial',
        ]) {
          expect(respuesta.body[0]).not.toHaveProperty(campo);
        }
      },
    );

    it.each([USUARIO_ADMIN, USUARIO_SUSCRIPTOR])(
      '%s recibe 403 al listar el catálogo',
      async (usuarioId) => {
        const respuesta = await request(servidor())
          .get('/ediciones-registro-oficial')
          .set('Authorization', await autorizacionDe(usuarioId));

        expect(respuesta.status).toBe(403);
        expect(respuesta.body.message).toBe('Acceso denegado');
      },
    );

    it('sin token recibe 401 al listar el catálogo', async () => {
      const respuesta = await request(servidor()).get(
        '/ediciones-registro-oficial',
      );
      expect(respuesta.status).toBe(401);
    });

    it.each([USUARIO_EDITOR, USUARIO_SUPERADMIN])(
      '%s consulta el detalle del catálogo',
      async (usuarioId) => {
        const norma = await registrarYObtenerNorma();
        const edicionPrincipal = edicionPrincipalDe(norma);
        const respuesta = await request(servidor())
          .get(`/ediciones-registro-oficial/${edicionPrincipal.id}`)
          .set('Authorization', await autorizacionDe(usuarioId));

        expect(respuesta.status).toBe(200);
        expect(respuesta.body).toMatchObject({
          id: edicionPrincipal.id,
          tipoPublicacionRegistroOficial: 'RO',
          numeroPublicacionRegistroOficial: 500,
          fechaPublicacionOficial: '2025-01-02',
          estadoResolucionFuente: 'PENDIENTE',
        });
      },
    );

    it.each([USUARIO_ADMIN, USUARIO_SUSCRIPTOR])(
      '%s recibe 403 al consultar el detalle del catálogo',
      async (usuarioId) => {
        const norma = await registrarYObtenerNorma();
        const edicionPrincipal = edicionPrincipalDe(norma);
        const respuesta = await request(servidor())
          .get(`/ediciones-registro-oficial/${edicionPrincipal.id}`)
          .set('Authorization', await autorizacionDe(usuarioId));

        expect(respuesta.status).toBe(403);
        expect(respuesta.body.message).toBe('Acceso denegado');
      },
    );

    it('detalle inexistente devuelve 404 para un actor editorial', async () => {
      const respuesta = await request(servidor())
        .get('/ediciones-registro-oficial/edicion-fantasma')
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR));
      expect(respuesta.status).toBe(404);
    });

    it('sin token recibe 401 al consultar el detalle del catálogo', async () => {
      const respuesta = await request(servidor()).get(
        '/ediciones-registro-oficial/edicion-1',
      );
      expect(respuesta.status).toBe(401);
    });
  });

  describe('corrección editorial PATCH /normas/:id', () => {
    it.each([USUARIO_EDITOR, USUARIO_SUPERADMIN])(
      '%s corrige campos de un borrador sin publicarlo',
      async (usuarioId) => {
        const norma = await registrarYObtenerNorma({ numero: '' });
        const respuesta = await request(servidor())
          .patch(`/normas/${norma.id}`)
          .set('Authorization', await autorizacionDe(usuarioId))
          .send({
            numero: '456',
            estadoJuridico: 'REFORMADA',
          });

        expect(respuesta.status).toBe(200);
        expect(respuesta.body.numero).toBe('456');
        expect(edicionPrincipalDe(respuesta.body).fuente).toBeNull();
        expect(respuesta.body).not.toHaveProperty('fuente');
        expect(respuesta.body.estadoJuridico).toBe('REFORMADA');
        expect(respuesta.body.estadoEditorial).toBe('BORRADOR');
      },
    );

    it('permite completar campos que quedaron vacíos', async () => {
      const norma = await registrarYObtenerNorma();
      const respuesta = await request(servidor())
        .patch(`/normas/${norma.id}`)
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
        .send({ numero: '789' });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.numero).toBe('789');
      expect(edicionPrincipalDe(respuesta.body).fuente).toBeNull();
    });

    it.each([USUARIO_ADMIN, USUARIO_SUSCRIPTOR])(
      '%s no puede actualizar (403)',
      async (usuarioId) => {
        const norma = await registrarYObtenerNorma();
        const respuesta = await request(servidor())
          .patch(`/normas/${norma.id}`)
          .set('Authorization', await autorizacionDe(usuarioId))
          .send({ titulo: 'Cambio prohibido' });
        expect(respuesta.status).toBe(403);
      },
    );

    it('una norma publicada no es editable (409)', async () => {
      const norma = await registrarYObtenerNorma();
      await establecerFuentesPendientesManualmente();
      await request(servidor())
        .post(`/normas/${norma.id}/publicar`)
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
        .send({});

      const respuesta = await request(servidor())
        .patch(`/normas/${norma.id}`)
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
        .send({ titulo: 'No debería aplicarse' });
      expect(respuesta.status).toBe(409);
      expect(respuesta.body.message).toBe('NORMA_NO_EDITABLE');
    });

    it('cuerpo vacío devuelve 400', async () => {
      const norma = await registrarYObtenerNorma();
      const respuesta = await request(servidor())
        .patch(`/normas/${norma.id}`)
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
        .send({});
      expect(respuesta.status).toBe(400);
    });

    it('rechaza atómicamente un campo válido mezclado con un campo de edición', async () => {
      const norma = await registrarYObtenerNorma();
      const tituloOriginal = 'Ley Orgánica de Prueba';

      const respuesta = await request(servidor())
        .patch(`/normas/${norma.id}`)
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
        .send({
          titulo: 'TÍTULO QUE NO DEBE APLICARSE',
          tipoPublicacionRegistroOficial: 'SRO',
        });

      expect(respuesta.status).toBe(400);
      const detalle = await request(servidor())
        .get(`/normas/${norma.id}`)
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR));
      expect(detalle.status).toBe(200);
      expect(detalle.body.titulo).toBe(tituloOriginal);
      expect(edicionPrincipalDe(detalle.body)).toEqual(
        edicionPrincipalDe(norma),
      );
      expect(detalle.body).not.toHaveProperty('edicionRegistroOficialId');
      expect(detalle.body).not.toHaveProperty(
        'tipoPublicacionRegistroOficial',
      );
    });
  });

  describe('contratos estrictos de mutación de ediciones', () => {
    it('POST edición rechaza propiedades adicionales', async () => {
      const respuesta = await crearEdicionManual({ loteId: 'lote-prohibido' });
      expect(respuesta.status).toBe(400);

      const listado = await request(servidor())
        .get('/ediciones-registro-oficial')
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR));
      expect(listado.body).toEqual([]);
    });

    it('PATCH fuente rechaza propiedades adicionales sin cambiar la edición', async () => {
      const norma = await registrarYObtenerNorma();
      const edicionPrincipal = edicionPrincipalDe(norma);
      const respuesta = await request(servidor())
        .patch(
          `/ediciones-registro-oficial/${edicionPrincipal.id}/fuente`,
        )
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
        .send({
          urlPdf: 'https://www.registroficial.gob.ec/ediciones/corregida.pdf',
          estadoResolucionFuente: 'MANUAL',
        });

      expect(respuesta.status).toBe(400);
      const detalle = await request(servidor())
        .get(`/normas/${norma.id}`)
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR));
      expect(edicionPrincipalDe(detalle.body).fuente).toBeNull();
      expect(detalle.body.estadoResolucionFuente).toBe('PENDIENTE');
    });

    it('PATCH cambio de edición rechaza propiedades adicionales sin cambiar la FK', async () => {
      const norma = await registrarYObtenerNorma();
      const nuevaEdicion = await crearEdicionManual();
      expect(nuevaEdicion.status).toBe(201);

      const respuesta = await request(servidor())
        .patch(`/normas/${norma.id}/edicion-registro-oficial`)
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
        .send({
          edicionRegistroOficialId: nuevaEdicion.body.id,
          fuente: 'https://url-prohibida.test/archivo.pdf',
        });

      expect(respuesta.status).toBe(400);
      const detalle = await request(servidor())
        .get(`/normas/${norma.id}`)
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR));
      expect(edicionPrincipalDe(detalle.body).id).toBe(
        edicionPrincipalDe(norma).id,
      );
    });
  });

  describe('proyección y corrección de ediciones asociadas', () => {
    it('GET lista y detalle proyectan estadoResolucionFuente', async () => {
      const norma = await registrarYObtenerNorma();

      const listaPendiente = await request(servidor())
        .get('/normas?estadoEditorial=BORRADOR')
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR));
      expect(listaPendiente.body[0].estadoResolucionFuente).toBe('PENDIENTE');

      await establecerFuentesPendientesManualmente();
      const detalleResuelto = await request(servidor())
        .get(`/normas/${norma.id}`)
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR));
      expect(detalleResuelto.body.estadoResolucionFuente).toBe('MANUAL');
      expect(edicionPrincipalDe(detalleResuelto.body).fuente).toBeTruthy();
    });

    it('cambiar edición actualiza toda la proyección sin alterar datos editoriales', async () => {
      const norma = await registrarYObtenerNorma();
      const nuevaEdicion = await crearEdicionManual();
      expect(nuevaEdicion.status).toBe(201);

      const cambio = await request(servidor())
        .patch(`/normas/${norma.id}/edicion-registro-oficial`)
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
        .send({ edicionRegistroOficialId: nuevaEdicion.body.id });

      expect(cambio.status).toBe(200);
      expect(cambio.body).toMatchObject({
        id: norma.id,
        titulo: 'Ley Orgánica de Prueba',
        estadoResolucionFuente: 'MANUAL',
      });
      expect(cambio.body.edicionesRegistroOficial).toEqual([
        expect.objectContaining({
          tipoRelacion: 'PRINCIPAL',
          id: nuevaEdicion.body.id,
          tipoPublicacionRegistroOficial: 'SRO',
          numeroPublicacionRegistroOficial: 600,
          fechaPublicacionOficial: '2026-06-02',
          fuente:
            'https://www.registroficial.gob.ec/ediciones/sro-600-manual.pdf',
        }),
        expect.objectContaining({
          tipoRelacion: 'CAMBIO',
          id: edicionPrincipalDe(norma).id,
        }),
      ]);
      expect(cambio.body).not.toHaveProperty('edicionRegistroOficialId');
      expect(cambio.body).not.toHaveProperty('fuente');
      const detalle = await request(servidor())
        .get(`/normas/${norma.id}`)
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR));
      expect(detalle.body).toMatchObject(cambio.body);
    });

    it('una norma PUBLICADA puede cambiar a una edición MANUAL con urlPdf', async () => {
      const norma = await registrarYObtenerNorma();
      await establecerFuentesPendientesManualmente();
      const publicacion = await request(servidor())
        .post(`/normas/${norma.id}/publicar`)
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
        .send({});
      expect(publicacion.status).toBe(200);
      const nuevaEdicion = await crearEdicionManual();
      expect(nuevaEdicion.status).toBe(201);

      const cambio = await request(servidor())
        .patch(`/normas/${norma.id}/edicion-registro-oficial`)
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
        .send({ edicionRegistroOficialId: nuevaEdicion.body.id });

      expect(cambio.status).toBe(200);
      expect(edicionPrincipalDe(cambio.body).id).toBe(nuevaEdicion.body.id);
      expect(cambio.body.edicionesRegistroOficial).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            tipoRelacion: 'CAMBIO',
            id: edicionPrincipalDe(norma).id,
          }),
        ]),
      );
      expect(cambio.body.estadoEditorial).toBe('PUBLICADA');
      expect(cambio.body).not.toHaveProperty('estadoResolucionFuente');
      expect(cambio.body.titulo).toBe('Ley Orgánica de Prueba');
    });

    it('el contrato editorial conserva cambios pendientes y el contenido suscrito los oculta', async () => {
      const norma = await registrarYObtenerNorma();
      const principalPendiente = edicionPrincipalDe(norma);
      const nuevaPrincipal = await crearEdicionManual();
      expect(nuevaPrincipal.status).toBe(201);

      const cambio = await request(servidor())
        .patch(`/normas/${norma.id}/edicion-registro-oficial`)
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
        .send({ edicionRegistroOficialId: nuevaPrincipal.body.id });

      expect(cambio.status).toBe(200);
      expect(cambio.body.edicionesRegistroOficial).toEqual([
        expect.objectContaining({
          tipoRelacion: 'PRINCIPAL',
          id: nuevaPrincipal.body.id,
        }),
        expect.objectContaining({
          tipoRelacion: 'CAMBIO',
          id: principalPendiente.id,
          fuente: null,
        }),
      ]);

      const publicacion = await request(servidor())
        .post(`/normas/${norma.id}/publicar`)
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
        .send({});
      expect(publicacion.status).toBe(200);

      const detalleEditorial = await request(servidor())
        .get(`/normas/${norma.id}`)
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR));
      expect(detalleEditorial.status).toBe(200);
      expect(detalleEditorial.body.edicionesRegistroOficial).toHaveLength(2);
      expect(detalleEditorial.body.edicionesRegistroOficial[1]).toMatchObject({
        tipoRelacion: 'CAMBIO',
        id: principalPendiente.id,
        fuente: null,
      });
      expect(detalleEditorial.body).not.toHaveProperty(
        'estadoResolucionFuente',
      );

      const contenido = await request(servidor())
        .get(`/normas/${norma.id}/contenido`)
        .set('Authorization', await autorizacionDe(USUARIO_SUSCRIPTOR));
      expect(contenido.status).toBe(200);
      expect(contenido.body.edicionesRegistroOficial).toEqual([
        expect.objectContaining({
          tipoRelacion: 'PRINCIPAL',
          id: nuevaPrincipal.body.id,
        }),
      ]);
      expect(contenido.body).not.toHaveProperty('estadoResolucionFuente');
      expect(contenido.body).not.toHaveProperty('origenRegistroOficial');
    });

    it('una norma PUBLICADA no puede cambiar a una edición PENDIENTE sin fuente (409)', async () => {
      const norma = await registrarYObtenerNorma();
      await establecerFuentesPendientesManualmente();
      const publicacion = await request(servidor())
        .post(`/normas/${norma.id}/publicar`)
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
        .send({});
      expect(publicacion.status).toBe(200);
      // Registrar otra norma con una triple nueva crea una edición PENDIENTE.
      const otraNorma = await registrarYObtenerNorma({
        titulo: 'Norma con edición pendiente',
        numeroPublicacionRegistroOficial: 777,
      });
      const edicionPendiente = edicionPrincipalDe(otraNorma);

      const cambio = await request(servidor())
        .patch(`/normas/${norma.id}/edicion-registro-oficial`)
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
        .send({
          edicionRegistroOficialId: edicionPendiente.id,
        });

      expect(cambio.status).toBe(409);
      expect(cambio.body.message).toBe('FUENTE_REQUERIDA');
      // La norma publicada conserva su edición original.
      const detalle = await request(servidor())
        .get(`/normas/${norma.id}`)
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR));
      expect(edicionPrincipalDe(detalle.body).id).toBe(
        edicionPrincipalDe(norma).id,
      );
    });

    it('corregir una fuente se proyecta en todas sus normas sin cambiar sus FK', async () => {
      const primera = await registrarYObtenerNorma({ titulo: 'Norma uno' });
      const segunda = await registrarYObtenerNorma({ titulo: 'Norma dos' });
      const edicionCompartida = edicionPrincipalDe(primera);
      expect(edicionPrincipalDe(segunda).id).toBe(edicionCompartida.id);
      const urlCorregida =
        'https://www.registroficial.gob.ec/ediciones/ro-500-corregida.pdf';

      const correccion = await request(servidor())
        .patch(
          `/ediciones-registro-oficial/${edicionCompartida.id}/fuente`,
        )
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
        .send({ urlPdf: urlCorregida });
      expect(correccion.status).toBe(200);
      expect(correccion.body.estadoResolucionFuente).toBe('MANUAL');

      const listado = await request(servidor())
        .get('/normas?estadoEditorial=BORRADOR')
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR));
      const asociadas = listado.body.filter(
        (item: { id: string }) =>
          item.id === primera.id || item.id === segunda.id,
      );
      expect(asociadas).toHaveLength(2);
      for (const item of asociadas) {
        expect(edicionPrincipalDe(item).fuente).toBe(urlCorregida);
        expect(item.estadoResolucionFuente).toBe('MANUAL');
        expect(edicionPrincipalDe(item).id).toBe(edicionCompartida.id);
        expect(item).not.toHaveProperty('edicionRegistroOficialId');
      }
    });
  });

  describe('obligatorios de publicación individual', () => {
    it('contenido y numero vacíos no bloquean la publicación', async () => {
      const norma = await registrarYObtenerNorma({ contenido: [], numero: '' });
      await establecerFuentesPendientesManualmente();
      const respuesta = await request(servidor())
        .post(`/normas/${norma.id}/publicar`)
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
        .send({});
      expect(respuesta.status).toBe(200);
      expect(respuesta.body.estadoEditorial).toBe('PUBLICADA');
    });

    it('publicar sin edición registro oficial devuelve 409 EDICION_REGISTRO_OFICIAL_REQUERIDA', async () => {
      const norma = await registrarYObtenerNorma({
        tipoPublicacionRegistroOficial: undefined,
        numeroPublicacionRegistroOficial: undefined,
        fechaPublicacionOficial: undefined,
      });

      const respuesta = await request(servidor())
        .post(`/normas/${norma.id}/publicar`)
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
        .send({});
      expect(respuesta.status).toBe(409);
      expect(respuesta.body.message).toBe('EDICION_REGISTRO_OFICIAL_REQUERIDA');
    });

    it('publicar sin título devuelve 409 TITULO_REQUERIDO', async () => {
      const norma = await registrarYObtenerNorma();
      await request(servidor())
        .patch(`/normas/${norma.id}`)
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
        .send({ titulo: '' });

      const respuesta = await request(servidor())
        .post(`/normas/${norma.id}/publicar`)
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
        .send({});
      expect(respuesta.status).toBe(409);
      expect(respuesta.body.message).toBe('TITULO_REQUERIDO');
    });
  });

  describe('publicación múltiple POST /normas/publicar', () => {
    it.each([USUARIO_EDITOR, USUARIO_SUPERADMIN])(
      '%s publica varias normas y las inválidas no bloquean a las demás',
      async (usuarioId) => {
        const normas = await registrarMultiplesNormas(3, [
          {},
          { titulo: 'Norma dos' },
          {
            titulo: 'Norma tres',
            tipoPublicacionRegistroOficial: undefined,
            numeroPublicacionRegistroOficial: undefined,
            fechaPublicacionOficial: undefined,
          },
        ]);

        await establecerFuentesPendientesManualmente();

        const respuesta = await request(servidor())
          .post('/normas/publicar')
          .set('Authorization', await autorizacionDe(usuarioId))
          .send({
            normaIds: [normas[0].id, normas[1].id, normas[2].id, 'norma-x'],
          });

        expect(respuesta.status).toBe(200);
        expect(respuesta.body.resultados).toEqual([
          { normaId: normas[0].id, publicada: true, estadoEditorial: 'PUBLICADA' },
          { normaId: normas[1].id, publicada: true, estadoEditorial: 'PUBLICADA' },
          {
            normaId: normas[2].id,
            publicada: false,
            razon: 'EDICION_REGISTRO_OFICIAL_REQUERIDA',
          },
          { normaId: 'norma-x', publicada: false, razon: 'NORMA_NO_ENCONTRADA' },
        ]);

        const publicadas = await request(servidor())
          .get('/normas?estadoEditorial=PUBLICADA')
          .set('Authorization', await autorizacionDe(USUARIO_EDITOR));
        expect(publicadas.body.map((norma: { id: string }) => norma.id)).toEqual([
          normas[0].id,
          normas[1].id,
        ]);
      },
    );

    it('una norma ya publicada se reporta individualmente y las restantes se publican', async () => {
      const normas = await registrarMultiplesNormas(2, [
        {},
        { titulo: 'Norma dos' },
      ]);
      await establecerFuentesPendientesManualmente();
      const primeraPublicacion = await request(servidor())
        .post(`/normas/${normas[0].id}/publicar`)
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
        .send({});
      expect(primeraPublicacion.status).toBe(200);

      const respuesta = await request(servidor())
        .post('/normas/publicar')
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
        .send({ normaIds: [normas[0].id, normas[1].id] });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.resultados).toEqual([
        {
          normaId: normas[0].id,
          publicada: false,
          razon: 'NORMA_YA_PUBLICADA',
        },
        {
          normaId: normas[1].id,
          publicada: true,
          estadoEditorial: 'PUBLICADA',
        },
      ]);
    });

    it.each([USUARIO_ADMIN, USUARIO_SUSCRIPTOR])(
      '%s no puede publicar en lote (403)',
      async (usuarioId) => {
        const norma = await registrarYObtenerNorma();
        const respuesta = await request(servidor())
          .post('/normas/publicar')
          .set('Authorization', await autorizacionDe(usuarioId))
          .send({ normaIds: [norma.id] });
        expect(respuesta.status).toBe(403);
      },
    );

    it('sin token devuelve 401', async () => {
      const respuesta = await request(servidor())
        .post('/normas/publicar')
        .send({ normaIds: ['norma-1'] });
      expect(respuesta.status).toBe(401);
    });

    it('lista vacía devuelve 400', async () => {
      const respuesta = await request(servidor())
        .post('/normas/publicar')
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
        .send({ normaIds: [] });
      expect(respuesta.status).toBe(400);
    });
  });

  it('al publicar se registra exactamente un evento', async () => {
    const norma = await registrarYObtenerNorma();
    await establecerFuentesPendientesManualmente();
    await request(servidor())
      .post(`/normas/${norma.id}/publicar`)
      .set('Authorization', await autorizacionDe(USUARIO_EDITOR))
      .send({ fechaPublicacionEnSistema: '2026-06-29T00:00:00.000Z' });

    const publicador = app.get<PublicadorEventosNormasEnMemoria>(
      TOKEN_PUBLICADOR_EVENTOS,
    );
    expect(publicador.eventos).toHaveLength(1);
    const evento = publicador.eventos[0];
    expect(evento.normaId).toBe(norma.id);
    expect(evento.fechaPublicacionEnSistema).toEqual(
      new Date('2026-06-29T00:00:00.000Z'),
    );
    expect(evento.tieneContenidoCompleto).toBe(false);
  });

  describe('Autorización de resolución automática de fuentes', () => {
    it('SUPERADMINISTRADOR recibe 503 si el catálogo no está configurado', async () => {
      const respuesta = await request(servidor())
        .post('/ediciones-registro-oficial/resolver-pendientes')
        .set('Authorization', await autorizacionDe(USUARIO_SUPERADMIN));

      expect(respuesta.status).toBe(503);
      expect(respuesta.body.message).toBe('CATALOGO_NO_DISPONIBLE');
    });

    it('EDITOR recibe 403 al intentar resolver-pendientes', async () => {
      const respuesta = await request(servidor())
        .post('/ediciones-registro-oficial/resolver-pendientes')
        .set('Authorization', await autorizacionDe(USUARIO_EDITOR));

      expect(respuesta.status).toBe(403);
      expect(respuesta.body.message).toBe('Acceso denegado');
    });

    it('ADMINISTRADOR recibe 403 al intentar resolver-pendientes', async () => {
      const respuesta = await request(servidor())
        .post('/ediciones-registro-oficial/resolver-pendientes')
        .set('Authorization', await autorizacionDe(USUARIO_ADMIN));

      expect(respuesta.status).toBe(403);
      expect(respuesta.body.message).toBe('Acceso denegado');
    });

    it('SUSCRIPTOR recibe 403 al intentar resolver-pendientes', async () => {
      const respuesta = await request(servidor())
        .post('/ediciones-registro-oficial/resolver-pendientes')
        .set('Authorization', await autorizacionDe(USUARIO_SUSCRIPTOR));

      expect(respuesta.status).toBe(403);
      expect(respuesta.body.message).toBe('Acceso denegado');
    });
  });
});
