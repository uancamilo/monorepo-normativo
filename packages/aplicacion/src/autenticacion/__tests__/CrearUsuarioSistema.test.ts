import { describe, expect, it, jest } from '@jest/globals';
import { RolUsuario, Usuario } from '@normativo/dominio';
import { CrearUsuarioSistema } from '../casos-uso/CrearUsuarioSistema';
import {
  RepositorioUsuariosSistema,
  UsuarioSistemaNuevo,
} from '../puertos/RepositorioUsuariosSistema';

const CONTRASENA_VALIDA = 'contrasena-inicial-larga';
const HASH_GENERADO = 'scrypt:v1:salt-nueva:hash-nuevo';

function crearActor(rol: RolUsuario): Usuario {
  return new Usuario({
    id: 'actor-1',
    nombre: 'Actor',
    apellido: 'Prueba',
    correo: 'actor@test.com',
    rol,
  });
}

function crearDependencias(opciones: {
  actor?: Usuario | null;
  correoExistente?: boolean;
} = {}) {
  const creados: UsuarioSistemaNuevo[] = [];
  const repositorioUsuariosSistema: RepositorioUsuariosSistema & {
    creados: UsuarioSistemaNuevo[];
  } = {
    creados,
    existeCorreo: jest.fn(async () => opciones.correoExistente ?? false),
    crear: jest.fn(async (usuario: UsuarioSistemaNuevo) => {
      creados.push(usuario);
    }),
  } as never;

  const generarHash = jest.fn(async () => HASH_GENERADO);

  const casoUso = new CrearUsuarioSistema({
    repositorioUsuarios: {
      buscarPorId: async () =>
        opciones.actor === undefined
          ? crearActor(RolUsuario.SUPERADMINISTRADOR)
          : opciones.actor,
    },
    repositorioUsuariosSistema,
    generadorIds: { generar: () => 'usuario-nuevo-1' },
    generadorHashContrasenas: { generar: generarHash },
  });

  return { casoUso, repositorioUsuariosSistema, generarHash };
}

function solicitudValida(overrides: Record<string, string> = {}) {
  return {
    usuarioAutenticadoId: 'actor-1',
    nombre: 'Editor',
    apellido: 'Principal',
    correo: 'editor.real@test.com',
    rol: 'EDITOR',
    contrasenaInicial: CONTRASENA_VALIDA,
    ...overrides,
  };
}

describe('CrearUsuarioSistema', () => {
  it('SUPERADMINISTRADOR crea EDITOR con correo normalizado y hash (sin exponerlo)', async () => {
    const { casoUso, repositorioUsuariosSistema, generarHash } =
      crearDependencias();

    const resultado = await casoUso.ejecutar(
      solicitudValida({ correo: '  Editor.Real@Test.COM ' }),
    );

    expect(resultado).toEqual({
      exitoso: true,
      usuario: {
        id: 'usuario-nuevo-1',
        nombre: 'Editor',
        apellido: 'Principal',
        correo: 'editor.real@test.com',
        rol: RolUsuario.EDITOR,
      },
    });
    // Se generó hash y se guardó el hash, nunca la contraseña plana.
    expect(generarHash).toHaveBeenCalledWith(CONTRASENA_VALIDA);
    expect(repositorioUsuariosSistema.creados).toHaveLength(1);
    expect(repositorioUsuariosSistema.creados[0]).toEqual({
      id: 'usuario-nuevo-1',
      nombre: 'Editor',
      apellido: 'Principal',
      correoNormalizado: 'editor.real@test.com',
      rol: RolUsuario.EDITOR,
      passwordHash: HASH_GENERADO,
    });
    // El resultado no contiene hash ni contraseña.
    const serializado = JSON.stringify(resultado);
    expect(serializado).not.toContain('scrypt');
    expect(serializado).not.toContain(CONTRASENA_VALIDA);
  });

  it('SUPERADMINISTRADOR crea ADMINISTRADOR', async () => {
    const { casoUso } = crearDependencias();

    const resultado = await casoUso.ejecutar(
      solicitudValida({ rol: 'ADMINISTRADOR', correo: 'admin.real@test.com' }),
    );

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(resultado.usuario.rol).toBe(RolUsuario.ADMINISTRADOR);
    }
  });

  it.each([
    RolUsuario.EDITOR,
    RolUsuario.ADMINISTRADOR,
    RolUsuario.SUSCRIPTOR,
  ])('un actor %s no puede crear usuarios (ACCESO_DENEGADO)', async (rol) => {
    const { casoUso, repositorioUsuariosSistema } = crearDependencias({
      actor: crearActor(rol),
    });

    const resultado = await casoUso.ejecutar(solicitudValida());

    expect(resultado).toEqual({ exitoso: false, razon: 'ACCESO_DENEGADO' });
    expect(repositorioUsuariosSistema.crear).not.toHaveBeenCalled();
  });

  it('un actor inexistente no puede crear usuarios (ACCESO_DENEGADO)', async () => {
    const { casoUso, repositorioUsuariosSistema } = crearDependencias({
      actor: null,
    });

    const resultado = await casoUso.ejecutar(solicitudValida());

    expect(resultado).toEqual({ exitoso: false, razon: 'ACCESO_DENEGADO' });
    expect(repositorioUsuariosSistema.crear).not.toHaveBeenCalled();
  });

  it.each([
    ['usuarioAutenticadoId', { usuarioAutenticadoId: ' ' }],
    ['nombre', { nombre: '' }],
    ['apellido', { apellido: '  ' }],
    ['correo', { correo: '' }],
    ['rol', { rol: '' }],
  ])('falla con SOLICITUD_INVALIDA si %s está vacío', async (_campo, overrides) => {
    const { casoUso, repositorioUsuariosSistema } = crearDependencias();

    const resultado = await casoUso.ejecutar(solicitudValida(overrides));

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
    expect(repositorioUsuariosSistema.crear).not.toHaveBeenCalled();
  });

  it.each(['', '   ', 'corta12345'])(
    "falla con CONTRASENA_INVALIDA si la contraseña inicial es '%s'",
    async (contrasenaInicial) => {
      const { casoUso, repositorioUsuariosSistema } = crearDependencias();

      const resultado = await casoUso.ejecutar(
        solicitudValida({ contrasenaInicial }),
      );

      expect(resultado).toEqual({
        exitoso: false,
        razon: 'CONTRASENA_INVALIDA',
      });
      expect(repositorioUsuariosSistema.crear).not.toHaveBeenCalled();
    },
  );

  it.each(['SUSCRIPTOR', 'SUPERADMINISTRADOR', 'ROL_INVENTADO'])(
    "falla con ROL_NO_PERMITIDO para rol '%s'",
    async (rol) => {
      const { casoUso, repositorioUsuariosSistema } = crearDependencias();

      const resultado = await casoUso.ejecutar(solicitudValida({ rol }));

      expect(resultado).toEqual({ exitoso: false, razon: 'ROL_NO_PERMITIDO' });
      expect(repositorioUsuariosSistema.crear).not.toHaveBeenCalled();
    },
  );

  it('prioriza ACCESO_DENEGADO: actor no autorizado con contraseña inválida no recibe CONTRASENA_INVALIDA', async () => {
    const { casoUso, repositorioUsuariosSistema } = crearDependencias({
      actor: crearActor(RolUsuario.ADMINISTRADOR),
    });

    const resultado = await casoUso.ejecutar(
      solicitudValida({ contrasenaInicial: 'corta' }),
    );

    expect(resultado).toEqual({ exitoso: false, razon: 'ACCESO_DENEGADO' });
    expect(repositorioUsuariosSistema.crear).not.toHaveBeenCalled();
  });

  it('falla con CORREO_YA_REGISTRADO si el correo ya existe (consulta normalizada)', async () => {
    const { casoUso, repositorioUsuariosSistema } = crearDependencias({
      correoExistente: true,
    });

    const resultado = await casoUso.ejecutar(
      solicitudValida({ correo: '  Editor.Real@Test.COM ' }),
    );

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'CORREO_YA_REGISTRADO',
    });
    expect(repositorioUsuariosSistema.existeCorreo).toHaveBeenCalledWith(
      'editor.real@test.com',
    );
    expect(repositorioUsuariosSistema.crear).not.toHaveBeenCalled();
  });
});
