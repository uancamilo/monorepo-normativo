import { describe, expect, it, jest } from '@jest/globals';
import { RolUsuario } from '@normativo/dominio';
import { CambiarContrasenaPropia } from '../casos-uso/CambiarContrasenaPropia';
import {
  CredencialesUsuario,
  RepositorioCredencialesUsuarios,
} from '../puertos/RepositorioCredencialesUsuarios';

const CONTRASENA_ACTUAL = 'contrasena-actual-valida';
const NUEVA_CONTRASENA = 'nueva-contrasena-valida';
const HASH_ACTUAL = 'scrypt:v1:salt-actual:hash-actual';
const HASH_NUEVO = 'scrypt:v1:salt-nueva:hash-nueva';

const CREDENCIALES_EDITOR: CredencialesUsuario = {
  usuarioId: 'usuario-editor-1',
  rol: RolUsuario.EDITOR,
  hashContrasena: HASH_ACTUAL,
};

function crearRepositorio(
  credencialesPorUsuarioId: Record<string, CredencialesUsuario> = {},
) {
  return {
    buscarPorCorreo: jest.fn(async () => null),
    buscarPorUsuarioId: jest.fn(async (usuarioId: string) => {
      return credencialesPorUsuarioId[usuarioId] ?? null;
    }),
    actualizarPasswordHash: jest.fn(async () => undefined),
  } as unknown as RepositorioCredencialesUsuarios & {
    buscarPorUsuarioId: jest.Mock;
    actualizarPasswordHash: jest.Mock;
  };
}

function crearCasoUso(overrides: {
  repositorio?: ReturnType<typeof crearRepositorio>;
  contrasenaCoincide?: boolean;
} = {}) {
  const repositorio =
    overrides.repositorio ??
    crearRepositorio({ 'usuario-editor-1': CREDENCIALES_EDITOR });

  const casoUso = new CambiarContrasenaPropia({
    repositorioCredenciales: repositorio,
    verificadorContrasenas: {
      verificar: async () => overrides.contrasenaCoincide ?? true,
    },
    generadorHashContrasenas: {
      generar: async () => HASH_NUEVO,
    },
  });

  return { casoUso, repositorio };
}

function solicitudValida(overrides: Record<string, string> = {}) {
  return {
    usuarioAutenticadoId: 'usuario-editor-1',
    contrasenaActual: CONTRASENA_ACTUAL,
    nuevaContrasena: NUEVA_CONTRASENA,
    ...overrides,
  };
}

describe('CambiarContrasenaPropia', () => {
  it('cambia la contraseña cuando el usuario existe, tiene hash y la actual es correcta', async () => {
    const { casoUso, repositorio } = crearCasoUso();

    const resultado = await casoUso.ejecutar(solicitudValida());

    expect(resultado).toEqual({ exitoso: true });
    expect(repositorio.actualizarPasswordHash).toHaveBeenCalledTimes(1);
    expect(repositorio.actualizarPasswordHash).toHaveBeenCalledWith(
      'usuario-editor-1',
      HASH_NUEVO,
    );
    // El resultado no contiene hash ni contraseña.
    expect(JSON.stringify(resultado)).not.toContain('scrypt');
    expect(JSON.stringify(resultado)).not.toContain(NUEVA_CONTRASENA);
  });

  it('falla con SOLICITUD_INVALIDA si usuarioAutenticadoId está vacío', async () => {
    const { casoUso, repositorio } = crearCasoUso();

    const resultado = await casoUso.ejecutar(
      solicitudValida({ usuarioAutenticadoId: '  ' }),
    );

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
    expect(repositorio.actualizarPasswordHash).not.toHaveBeenCalled();
  });

  it('falla con SOLICITUD_INVALIDA si contrasenaActual está vacía', async () => {
    const { casoUso, repositorio } = crearCasoUso();

    const resultado = await casoUso.ejecutar(
      solicitudValida({ contrasenaActual: '' }),
    );

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
    expect(repositorio.actualizarPasswordHash).not.toHaveBeenCalled();
  });

  it.each(['', '   ', 'corta12345'])(
    "falla con NUEVA_CONTRASENA_INVALIDA si la nueva contraseña es '%s'",
    async (nuevaContrasena) => {
      const { casoUso, repositorio } = crearCasoUso();

      const resultado = await casoUso.ejecutar(
        solicitudValida({ nuevaContrasena }),
      );

      expect(resultado).toEqual({
        exitoso: false,
        razon: 'NUEVA_CONTRASENA_INVALIDA',
      });
      expect(repositorio.actualizarPasswordHash).not.toHaveBeenCalled();
    },
  );

  it('falla con CREDENCIALES_INVALIDAS si el usuario no existe', async () => {
    const repositorio = crearRepositorio({});
    const { casoUso } = crearCasoUso({ repositorio });

    const resultado = await casoUso.ejecutar(solicitudValida());

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'CREDENCIALES_INVALIDAS',
    });
    expect(repositorio.actualizarPasswordHash).not.toHaveBeenCalled();
  });

  it('falla con CREDENCIALES_INVALIDAS si el usuario no tiene passwordHash', async () => {
    const repositorio = crearRepositorio({
      'usuario-editor-1': { ...CREDENCIALES_EDITOR, hashContrasena: null },
    });
    const { casoUso } = crearCasoUso({ repositorio });

    const resultado = await casoUso.ejecutar(solicitudValida());

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'CREDENCIALES_INVALIDAS',
    });
    expect(repositorio.actualizarPasswordHash).not.toHaveBeenCalled();
  });

  it('falla con CREDENCIALES_INVALIDAS si la contraseña actual es incorrecta', async () => {
    const { casoUso, repositorio } = crearCasoUso({ contrasenaCoincide: false });

    const resultado = await casoUso.ejecutar(solicitudValida());

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'CREDENCIALES_INVALIDAS',
    });
    expect(repositorio.actualizarPasswordHash).not.toHaveBeenCalled();
  });

  it('no revela diferencias: usuario inexistente y contraseña incorrecta responden igual', async () => {
    const sinUsuario = crearCasoUso({ repositorio: crearRepositorio({}) });
    const contrasenaMala = crearCasoUso({ contrasenaCoincide: false });

    const porInexistente = await sinUsuario.casoUso.ejecutar(solicitudValida());
    const porContrasena = await contrasenaMala.casoUso.ejecutar(solicitudValida());

    expect(porInexistente).toEqual(porContrasena);
  });

  it('falla con NUEVA_CONTRASENA_IGUAL_A_ACTUAL si la nueva equivale a la actual', async () => {
    const { casoUso, repositorio } = crearCasoUso();

    const resultado = await casoUso.ejecutar(
      solicitudValida({ nuevaContrasena: CONTRASENA_ACTUAL }),
    );

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'NUEVA_CONTRASENA_IGUAL_A_ACTUAL',
    });
    expect(repositorio.actualizarPasswordHash).not.toHaveBeenCalled();
  });

  it('prioriza CREDENCIALES_INVALIDAS: actual incorrecta e igual a la nueva no revela la igualdad', async () => {
    const { casoUso, repositorio } = crearCasoUso({ contrasenaCoincide: false });

    const resultado = await casoUso.ejecutar(
      solicitudValida({
        contrasenaActual: 'incorrecta-larga-123',
        nuevaContrasena: 'incorrecta-larga-123',
      }),
    );

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'CREDENCIALES_INVALIDAS',
    });
    expect(repositorio.actualizarPasswordHash).not.toHaveBeenCalled();
  });
});
