import { describe, expect, it, jest } from '@jest/globals';
import { RolUsuario } from '@normativo/dominio';
import { IniciarSesion } from '../casos-uso/IniciarSesion';
import {
  CredencialesUsuario,
  RepositorioCredencialesUsuarios,
} from '../puertos/RepositorioCredencialesUsuarios';
import { VerificadorContrasenas } from '../puertos/VerificadorContrasenas';

function crearRepositorio(
  credencialesPorCorreo: Record<string, CredencialesUsuario> = {},
): RepositorioCredencialesUsuarios & { buscarPorCorreo: jest.Mock } {
  return {
    buscarPorCorreo: jest.fn(async (correo: string) => {
      return credencialesPorCorreo[correo] ?? null;
    }),
  } as RepositorioCredencialesUsuarios & { buscarPorCorreo: jest.Mock };
}

function crearVerificador(resultado: boolean): VerificadorContrasenas {
  return {
    verificar: async () => resultado,
  };
}

const CREDENCIALES_EDITOR: CredencialesUsuario = {
  usuarioId: 'usuario-editor-1',
  rol: RolUsuario.EDITOR,
  hashContrasena: 'scrypt:v1:salt:hash',
};

describe('IniciarSesion', () => {
  it('devuelve SOLICITUD_INVALIDA si el correo está vacío', async () => {
    const casoUso = new IniciarSesion({
      repositorioCredenciales: crearRepositorio(),
      verificadorContrasenas: crearVerificador(true),
    });

    const resultado = await casoUso.ejecutar({ correo: '  ', contrasena: 'x' });

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
  });

  it('devuelve SOLICITUD_INVALIDA si la contraseña está vacía', async () => {
    const casoUso = new IniciarSesion({
      repositorioCredenciales: crearRepositorio(),
      verificadorContrasenas: crearVerificador(true),
    });

    const resultado = await casoUso.ejecutar({
      correo: 'editor@test.com',
      contrasena: '',
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
  });

  it('normaliza el correo antes de buscar credenciales', async () => {
    const repositorio = crearRepositorio({
      'editor@test.com': CREDENCIALES_EDITOR,
    });
    const casoUso = new IniciarSesion({
      repositorioCredenciales: repositorio,
      verificadorContrasenas: crearVerificador(true),
    });

    const resultado = await casoUso.ejecutar({
      correo: '  EDITOR@Test.COM ',
      contrasena: 'Password123!',
    });

    expect(repositorio.buscarPorCorreo).toHaveBeenCalledWith('editor@test.com');
    expect(resultado.exitoso).toBe(true);
  });

  it('devuelve CREDENCIALES_INVALIDAS si el usuario no existe', async () => {
    const casoUso = new IniciarSesion({
      repositorioCredenciales: crearRepositorio(),
      verificadorContrasenas: crearVerificador(true),
    });

    const resultado = await casoUso.ejecutar({
      correo: 'nadie@test.com',
      contrasena: 'Password123!',
    });

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'CREDENCIALES_INVALIDAS',
    });
  });

  it('devuelve CREDENCIALES_INVALIDAS si el usuario no tiene hash de contraseña', async () => {
    const casoUso = new IniciarSesion({
      repositorioCredenciales: crearRepositorio({
        'editor@test.com': { ...CREDENCIALES_EDITOR, hashContrasena: null },
      }),
      verificadorContrasenas: crearVerificador(true),
    });

    const resultado = await casoUso.ejecutar({
      correo: 'editor@test.com',
      contrasena: 'Password123!',
    });

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'CREDENCIALES_INVALIDAS',
    });
  });

  it('devuelve CREDENCIALES_INVALIDAS si la contraseña no coincide', async () => {
    const casoUso = new IniciarSesion({
      repositorioCredenciales: crearRepositorio({
        'editor@test.com': CREDENCIALES_EDITOR,
      }),
      verificadorContrasenas: crearVerificador(false),
    });

    const resultado = await casoUso.ejecutar({
      correo: 'editor@test.com',
      contrasena: 'incorrecta',
    });

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'CREDENCIALES_INVALIDAS',
    });
  });

  it('no revela si el correo existe: misma razón para correo inexistente y contraseña incorrecta', async () => {
    const conUsuario = new IniciarSesion({
      repositorioCredenciales: crearRepositorio({
        'editor@test.com': CREDENCIALES_EDITOR,
      }),
      verificadorContrasenas: crearVerificador(false),
    });
    const sinUsuario = new IniciarSesion({
      repositorioCredenciales: crearRepositorio(),
      verificadorContrasenas: crearVerificador(false),
    });

    const contrasenaIncorrecta = await conUsuario.ejecutar({
      correo: 'editor@test.com',
      contrasena: 'incorrecta',
    });
    const correoInexistente = await sinUsuario.ejecutar({
      correo: 'nadie@test.com',
      contrasena: 'incorrecta',
    });

    expect(contrasenaIncorrecta).toEqual(correoInexistente);
  });

  it('con credenciales válidas retorna id y rol del usuario', async () => {
    const casoUso = new IniciarSesion({
      repositorioCredenciales: crearRepositorio({
        'editor@test.com': CREDENCIALES_EDITOR,
      }),
      verificadorContrasenas: crearVerificador(true),
    });

    const resultado = await casoUso.ejecutar({
      correo: 'editor@test.com',
      contrasena: 'Password123!',
    });

    expect(resultado).toEqual({
      exitoso: true,
      usuario: { id: 'usuario-editor-1', rol: RolUsuario.EDITOR },
    });
  });
});
