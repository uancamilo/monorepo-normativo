import { describe, expect, it } from '@jest/globals';
import { RolUsuario } from '@normativo/dominio';
import { UsuarioSistemaNuevo } from '@normativo/aplicacion';
import { RepositorioUsuariosSistemaEnMemoria } from '../RepositorioUsuariosSistemaEnMemoria';
import { RepositorioUsuariosEnMemoria } from '../RepositorioUsuariosEnMemoria';
import { RepositorioCredencialesUsuariosEnMemoria } from '../RepositorioCredencialesUsuariosEnMemoria';

function usuarioNuevo(overrides: Partial<UsuarioSistemaNuevo> = {}): UsuarioSistemaNuevo {
  return {
    id: 'usuario-nuevo-1',
    nombre: 'Editor',
    apellido: 'Principal',
    correoNormalizado: 'editor.real@test.com',
    rol: RolUsuario.EDITOR,
    passwordHash: 'scrypt:v1:c2FsdA==:aGFzaA==',
    ...overrides,
  };
}

describe('RepositorioUsuariosSistemaEnMemoria', () => {
  function crearRepositorio() {
    const usuarios = new RepositorioUsuariosEnMemoria();
    const credenciales = new RepositorioCredencialesUsuariosEnMemoria();
    return {
      repositorio: new RepositorioUsuariosSistemaEnMemoria(usuarios, credenciales),
      usuarios,
      credenciales,
    };
  }

  it('crea el usuario y sus credenciales', async () => {
    const { repositorio, usuarios, credenciales } = crearRepositorio();

    const resultado = await repositorio.crear(usuarioNuevo());

    expect(resultado).toEqual({ exitoso: true });
    const usuario = await usuarios.buscarPorId('usuario-nuevo-1');
    expect(usuario?.tieneRol(RolUsuario.EDITOR)).toBe(true);
    const credencial = await credenciales.buscarPorCorreo('editor.real@test.com');
    expect(credencial?.usuarioId).toBe('usuario-nuevo-1');
    expect(credencial?.hashContrasena).toBe('scrypt:v1:c2FsdA==:aGFzaA==');
  });

  it('reporta duplicado en la garantía final si el correo ya existe (segunda creación)', async () => {
    const { repositorio, usuarios } = crearRepositorio();
    await repositorio.crear(usuarioNuevo());

    const resultado = await repositorio.crear(
      usuarioNuevo({ id: 'usuario-nuevo-2', nombre: 'Otro' }),
    );

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'CORREO_YA_REGISTRADO',
    });
    // No se sobrescribió al usuario original ni se creó el segundo.
    expect(await usuarios.buscarPorId('usuario-nuevo-2')).toBeNull();
    expect((await usuarios.buscarPorId('usuario-nuevo-1'))?.nombre).toBe('Editor');
  });

  it('reporta duplicado también contra correos semilla', async () => {
    const { repositorio } = crearRepositorio();

    const resultado = await repositorio.crear(
      usuarioNuevo({ correoNormalizado: 'editor@test.com' }),
    );

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'CORREO_YA_REGISTRADO',
    });
  });
});
