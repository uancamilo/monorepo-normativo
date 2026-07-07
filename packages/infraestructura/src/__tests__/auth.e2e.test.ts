import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthModule } from '../autenticacion/http/auth.module';
// NormasModule se monta junto a AuthModule para probar login -> endpoint
// protegido sin depender de PERSISTENCIA del entorno.
import { NormasModule } from '../normas/normas.module';
import { CONTRASENA_SEMILLA } from '../memoria/RepositorioCredencialesUsuariosEnMemoria';

const CORREO_EDITOR = 'editor@test.com';

describe('Auth (e2e memoria)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule, NormasModule],
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

  function cuerpoNormaValido() {
    return {
      numero: '123',
      titulo: 'Ley Orgánica de Prueba (login)',
      contenido: '',
      tipoNorma: 'Ley',
      institucionExpide: 'Asamblea Nacional',
      fuente: 'https://www.registroficial.gob.ec/norma-login.pdf',
      estadoJuridico: 'VIGENTE',
      fechaExpedicion: '2025-01-01',
      fechaPublicacionOficial: '2025-01-02',
    };
  }

  it('login con editor válido retorna accessToken, tokenType Bearer y expiresIn', async () => {
    const respuesta = await request(servidor())
      .post('/auth/login')
      .send({ correo: CORREO_EDITOR, contrasena: CONTRASENA_SEMILLA });

    expect(respuesta.status).toBe(200);
    expect(typeof respuesta.body.accessToken).toBe('string');
    expect(respuesta.body.accessToken.length).toBeGreaterThan(0);
    expect(respuesta.body.tokenType).toBe('Bearer');
    expect(respuesta.body.expiresIn).toBe(3600);
    expect(respuesta.body).not.toHaveProperty('passwordHash');
  });

  it('el token emitido por login permite registrar una norma', async () => {
    const login = await request(servidor())
      .post('/auth/login')
      .send({ correo: CORREO_EDITOR, contrasena: CONTRASENA_SEMILLA });
    expect(login.status).toBe(200);

    const registro = await request(servidor())
      .post('/normas')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send(cuerpoNormaValido());

    expect(registro.status).toBe(201);
    expect(registro.body.estadoEditorial).toBe('BORRADOR');
  });

  it('contraseña incorrecta devuelve 401', async () => {
    const respuesta = await request(servidor())
      .post('/auth/login')
      .send({ correo: CORREO_EDITOR, contrasena: 'incorrecta' });

    expect(respuesta.status).toBe(401);
  });

  it('correo inexistente devuelve 401', async () => {
    const respuesta = await request(servidor())
      .post('/auth/login')
      .send({ correo: 'nadie@test.com', contrasena: CONTRASENA_SEMILLA });

    expect(respuesta.status).toBe(401);
  });

  it('no revela si el correo existe: misma respuesta para correo inexistente y contraseña incorrecta', async () => {
    const contrasenaIncorrecta = await request(servidor())
      .post('/auth/login')
      .send({ correo: CORREO_EDITOR, contrasena: 'incorrecta' });
    const correoInexistente = await request(servidor())
      .post('/auth/login')
      .send({ correo: 'nadie@test.com', contrasena: 'incorrecta' });

    expect(contrasenaIncorrecta.status).toBe(401);
    expect(correoInexistente.status).toBe(401);
    expect(contrasenaIncorrecta.body).toEqual(correoInexistente.body);
  });

  it('body inválido devuelve 400', async () => {
    const sinContrasena = await request(servidor())
      .post('/auth/login')
      .send({ correo: CORREO_EDITOR });
    const sinCorreo = await request(servidor())
      .post('/auth/login')
      .send({ contrasena: CONTRASENA_SEMILLA });
    const vacio = await request(servidor()).post('/auth/login').send({});

    expect(sinContrasena.status).toBe(400);
    expect(sinCorreo.status).toBe(400);
    expect(vacio.status).toBe(400);
  });

  it('el correo se normaliza: mayúsculas y espacios no impiden el login', async () => {
    const respuesta = await request(servidor())
      .post('/auth/login')
      .send({ correo: '  EDITOR@Test.COM ', contrasena: CONTRASENA_SEMILLA });

    expect(respuesta.status).toBe(200);
    expect(typeof respuesta.body.accessToken).toBe('string');
  });

  describe('POST /auth/cambiar-contrasena', () => {
    const NUEVA_CONTRASENA = 'nueva-contrasena-larga-1';

    async function tokenDeEditor(): Promise<string> {
      const login = await request(servidor())
        .post('/auth/login')
        .send({ correo: CORREO_EDITOR, contrasena: CONTRASENA_SEMILLA });
      expect(login.status).toBe(200);
      return login.body.accessToken as string;
    }

    it('flujo completo: login -> cambiar (204 sin body) -> vieja falla -> nueva funciona', async () => {
      // Login con contraseña actual funciona antes del cambio.
      const token = await tokenDeEditor();

      const cambio = await request(servidor())
        .post('/auth/cambiar-contrasena')
        .set('Authorization', `Bearer ${token}`)
        .send({
          contrasenaActual: CONTRASENA_SEMILLA,
          nuevaContrasena: NUEVA_CONTRASENA,
        });
      expect(cambio.status).toBe(204);
      // Sin body sensible: 204 No Content vacío.
      expect(cambio.body).toEqual({});
      expect(cambio.text ?? '').toBe('');

      const loginVieja = await request(servidor())
        .post('/auth/login')
        .send({ correo: CORREO_EDITOR, contrasena: CONTRASENA_SEMILLA });
      expect(loginVieja.status).toBe(401);

      const loginNueva = await request(servidor())
        .post('/auth/login')
        .send({ correo: CORREO_EDITOR, contrasena: NUEVA_CONTRASENA });
      expect(loginNueva.status).toBe(200);
      expect(typeof loginNueva.body.accessToken).toBe('string');
    });

    it('sin Bearer devuelve 401', async () => {
      const respuesta = await request(servidor())
        .post('/auth/cambiar-contrasena')
        .send({
          contrasenaActual: CONTRASENA_SEMILLA,
          nuevaContrasena: NUEVA_CONTRASENA,
        });
      expect(respuesta.status).toBe(401);
    });

    it('con Bearer inválido devuelve 401', async () => {
      const respuesta = await request(servidor())
        .post('/auth/cambiar-contrasena')
        .set('Authorization', 'Bearer token-invalido')
        .send({
          contrasenaActual: CONTRASENA_SEMILLA,
          nuevaContrasena: NUEVA_CONTRASENA,
        });
      expect(respuesta.status).toBe(401);
    });

    it('con contraseña actual incorrecta devuelve 401 genérico', async () => {
      const token = await tokenDeEditor();

      const respuesta = await request(servidor())
        .post('/auth/cambiar-contrasena')
        .set('Authorization', `Bearer ${token}`)
        .send({
          contrasenaActual: 'incorrecta-larga-123',
          nuevaContrasena: NUEVA_CONTRASENA,
        });

      expect(respuesta.status).toBe(401);
      expect(JSON.stringify(respuesta.body)).not.toContain('scrypt');
    });

    it('actual incorrecta e igual a la nueva devuelve 401 (no revela la igualdad)', async () => {
      const token = await tokenDeEditor();

      const respuesta = await request(servidor())
        .post('/auth/cambiar-contrasena')
        .set('Authorization', `Bearer ${token}`)
        .send({
          contrasenaActual: 'incorrecta-larga-123',
          nuevaContrasena: 'incorrecta-larga-123',
        });

      expect(respuesta.status).toBe(401);
    });

    it('con nueva contraseña corta devuelve 400', async () => {
      const token = await tokenDeEditor();

      const respuesta = await request(servidor())
        .post('/auth/cambiar-contrasena')
        .set('Authorization', `Bearer ${token}`)
        .send({
          contrasenaActual: CONTRASENA_SEMILLA,
          nuevaContrasena: 'corta12345',
        });

      expect(respuesta.status).toBe(400);
    });

    it('con nueva contraseña igual a la actual devuelve 400', async () => {
      const token = await tokenDeEditor();

      const respuesta = await request(servidor())
        .post('/auth/cambiar-contrasena')
        .set('Authorization', `Bearer ${token}`)
        .send({
          contrasenaActual: CONTRASENA_SEMILLA,
          nuevaContrasena: CONTRASENA_SEMILLA,
        });

      expect(respuesta.status).toBe(400);
    });
  });
});
