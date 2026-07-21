import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
// Se montan los tres módulos memoria (mismas instancias compartidas) para
// probar login -> crear usuario -> login del creado -> registrar norma.
import { NormasModule } from '../normas/normas.module';
import { AuthModule } from '../autenticacion/http/auth.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { CONTRASENA_SEMILLA } from '../memoria/RepositorioCredencialesUsuariosEnMemoria';

const CONTRASENA_INICIAL = 'contrasena-inicial-larga';

describe('Usuarios del sistema (e2e memoria)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [NormasModule, AuthModule, UsuariosModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  function servidor() {
    return app.getHttpServer();
  }

  async function tokenDe(correo: string, contrasena: string): Promise<string> {
    const login = await request(servidor())
      .post('/auth/login')
      .send({ correo, contrasena });
    expect(login.status).toBe(200);
    return login.body.accessToken as string;
  }

  function cuerpoUsuarioValido(overrides: Record<string, unknown> = {}) {
    return {
      nombre: 'Editor',
      apellido: 'Principal',
      correo: 'editor.real@test.com',
      rol: 'EDITOR',
      contrasenaInicial: CONTRASENA_INICIAL,
      ...overrides,
    };
  }

  it('superadmin crea EDITOR (201), el editor inicia sesión y registra una norma', async () => {
    const tokenSuperadmin = await tokenDe('superadmin@test.com', CONTRASENA_SEMILLA);

    const creacion = await request(servidor())
      .post('/usuarios/sistema')
      .set('Authorization', `Bearer ${tokenSuperadmin}`)
      .send(cuerpoUsuarioValido());

    expect(creacion.status).toBe(201);
    expect(creacion.body).toEqual({
      id: expect.any(String),
      nombre: 'Editor',
      apellido: 'Principal',
      correo: 'editor.real@test.com',
      rol: 'EDITOR',
    });
    expect(creacion.body).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(creacion.body)).not.toContain(CONTRASENA_INICIAL);

    // El editor creado puede iniciar sesión con su contraseña inicial.
    const tokenEditor = await tokenDe('editor.real@test.com', CONTRASENA_INICIAL);

    // Y puede registrar una norma (permiso editorial real, no del claim).
    const registro = await request(servidor())
      .post('/normas')
      .set('Authorization', `Bearer ${tokenEditor}`)
      .send({
        numero: '789',
        titulo: 'Ley registrada por editor creado',
        contenido: [],
        tipoNorma: 'Ley',
        institucionExpide: 'Asamblea Nacional',
        estadoJuridico: 'VIGENTE',
        fechaExpedicion: '2025-01-01',
      });
    expect(registro.status).toBe(201);
    expect(registro.body.estadoEditorial).toBe('BORRADOR');
  });

  it('superadmin crea ADMINISTRADOR (201)', async () => {
    const token = await tokenDe('superadmin@test.com', CONTRASENA_SEMILLA);

    const creacion = await request(servidor())
      .post('/usuarios/sistema')
      .set('Authorization', `Bearer ${token}`)
      .send(
        cuerpoUsuarioValido({ rol: 'ADMINISTRADOR', correo: 'admin.real@test.com' }),
      );

    expect(creacion.status).toBe(201);
    expect(creacion.body.rol).toBe('ADMINISTRADOR');
  });

  it('sin token devuelve 401', async () => {
    const respuesta = await request(servidor())
      .post('/usuarios/sistema')
      .send(cuerpoUsuarioValido());
    expect(respuesta.status).toBe(401);
  });

  it.each([
    ['editor@test.com'],
    ['admin@test.com'],
    ['suscriptor@test.com'],
  ])('con token de %s devuelve 403', async (correo) => {
    const token = await tokenDe(correo, CONTRASENA_SEMILLA);

    const respuesta = await request(servidor())
      .post('/usuarios/sistema')
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpoUsuarioValido());

    expect(respuesta.status).toBe(403);
  });

  it('correo duplicado devuelve 409', async () => {
    const token = await tokenDe('superadmin@test.com', CONTRASENA_SEMILLA);

    const primera = await request(servidor())
      .post('/usuarios/sistema')
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpoUsuarioValido());
    expect(primera.status).toBe(201);

    const duplicada = await request(servidor())
      .post('/usuarios/sistema')
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpoUsuarioValido({ nombre: 'Otro' }));
    expect(duplicada.status).toBe(409);

    // También choca contra correos semilla existentes.
    const contraSemilla = await request(servidor())
      .post('/usuarios/sistema')
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpoUsuarioValido({ correo: 'editor@test.com' }));
    expect(contraSemilla.status).toBe(409);
  });

  it.each(['SUSCRIPTOR', 'SUPERADMINISTRADOR', 'ROL_INVENTADO'])(
    "rol no permitido '%s' devuelve 400",
    async (rol) => {
      const token = await tokenDe('superadmin@test.com', CONTRASENA_SEMILLA);

      const respuesta = await request(servidor())
        .post('/usuarios/sistema')
        .set('Authorization', `Bearer ${token}`)
        .send(cuerpoUsuarioValido({ rol }));

      expect(respuesta.status).toBe(400);
    },
  );

  it('contraseña inicial corta devuelve 400', async () => {
    const token = await tokenDe('superadmin@test.com', CONTRASENA_SEMILLA);

    const respuesta = await request(servidor())
      .post('/usuarios/sistema')
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpoUsuarioValido({ contrasenaInicial: 'corta12345' }));

    expect(respuesta.status).toBe(400);
  });
});
