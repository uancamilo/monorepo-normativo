import { beforeEach, describe, expect, it } from '@jest/globals';
import { RolUsuario, Usuario } from '@normativo/dominio';
import { ConsultarPerfilPropio } from '../casos-uso/ConsultarPerfilPropio';
import { RepositorioUsuarios } from '../../normas/puertos/RepositorioUsuarios';

/**
 * Fake local y mínimo del puerto `RepositorioUsuarios` (único método:
 * `buscarPorId`). Vive en esta suite a propósito: la suite de autenticación no
 * debe depender del soporte privado de pruebas de otra funcionalidad.
 * `busquedas` permite verificar el fail-fast (no consultar ante id vacío).
 */
class RepositorioUsuariosFakeLocal implements RepositorioUsuarios {
  private readonly usuariosPorId = new Map<string, Usuario>();
  readonly busquedas: string[] = [];

  agregar(usuario: Usuario): void {
    this.usuariosPorId.set(usuario.obtenerId(), usuario);
  }

  async buscarPorId(id: string): Promise<Usuario | null> {
    this.busquedas.push(id);
    return this.usuariosPorId.get(id) ?? null;
  }
}

const ROLES = [
  RolUsuario.SUPERADMINISTRADOR,
  RolUsuario.ADMINISTRADOR,
  RolUsuario.EDITOR,
  RolUsuario.SUSCRIPTOR,
] as const;

function crearUsuario(
  parcial: Partial<{
    id: string;
    nombre: string;
    apellido: string;
    correo: string;
    rol: RolUsuario;
  }> = {},
): Usuario {
  return new Usuario({
    id: 'usuario-1',
    nombre: 'Ana',
    apellido: 'Pérez',
    correo: 'ana.perez@test.com',
    rol: RolUsuario.EDITOR,
    ...parcial,
  });
}

describe('ConsultarPerfilPropio', () => {
  let repositorioUsuarios: RepositorioUsuariosFakeLocal;
  let consultarPerfilPropio: ConsultarPerfilPropio;

  beforeEach(() => {
    repositorioUsuarios = new RepositorioUsuariosFakeLocal();
    consultarPerfilPropio = new ConsultarPerfilPropio({ repositorioUsuarios });
  });

  it.each(['', '   '])(
    'id vacío (%p) es SOLICITUD_INVALIDA y no consulta el repositorio',
    async (usuarioAutenticadoId) => {
      const resultado = await consultarPerfilPropio.ejecutar({
        usuarioAutenticadoId,
      });

      expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
      expect(repositorioUsuarios.busquedas).toEqual([]);
    },
  );

  it('usuario inexistente es USUARIO_NO_ENCONTRADO', async () => {
    const resultado = await consultarPerfilPropio.ejecutar({
      usuarioAutenticadoId: 'usuario-fantasma',
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'USUARIO_NO_ENCONTRADO' });
    expect(repositorioUsuarios.busquedas).toEqual(['usuario-fantasma']);
  });

  it('usuario existente devuelve el perfil mínimo exacto', async () => {
    repositorioUsuarios.agregar(crearUsuario());

    const resultado = await consultarPerfilPropio.ejecutar({
      usuarioAutenticadoId: 'usuario-1',
    });

    expect(resultado).toEqual({
      exitoso: true,
      perfil: {
        id: 'usuario-1',
        nombre: 'Ana',
        apellido: 'Pérez',
        correo: 'ana.perez@test.com',
        rol: RolUsuario.EDITOR,
      },
    });
  });

  it.each(ROLES)('%s puede consultar su propio perfil', async (rol) => {
    repositorioUsuarios.agregar(
      crearUsuario({ id: `usuario-${rol}`, correo: `${rol}@test.com`, rol }),
    );

    const resultado = await consultarPerfilPropio.ejecutar({
      usuarioAutenticadoId: `usuario-${rol}`,
    });

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) {
      return;
    }
    expect(resultado.perfil.rol).toBe(rol);
    expect(resultado.perfil.id).toBe(`usuario-${rol}`);
  });

  it('el perfil no expone propiedades adicionales a las cinco del contrato', async () => {
    repositorioUsuarios.agregar(crearUsuario());

    const resultado = await consultarPerfilPropio.ejecutar({
      usuarioAutenticadoId: 'usuario-1',
    });

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) {
      return;
    }
    expect(Object.keys(resultado.perfil).sort()).toEqual([
      'apellido',
      'correo',
      'id',
      'nombre',
      'rol',
    ]);
    const serializado = JSON.stringify(resultado.perfil);
    expect(serializado).not.toContain('passwordHash');
    expect(serializado).not.toContain('hashContrasena');
    expect(serializado).not.toContain('contrasena');
  });

  it('el correo sale normalizado tal como lo conserva el dominio', async () => {
    repositorioUsuarios.agregar(
      crearUsuario({ correo: '  ANA.Perez@Test.COM  ' }),
    );

    const resultado = await consultarPerfilPropio.ejecutar({
      usuarioAutenticadoId: 'usuario-1',
    });

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) {
      return;
    }
    expect(resultado.perfil.correo).toBe('ana.perez@test.com');
  });
});
