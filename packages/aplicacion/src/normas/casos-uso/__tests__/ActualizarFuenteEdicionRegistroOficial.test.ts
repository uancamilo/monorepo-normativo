import { beforeEach, describe, expect, it } from '@jest/globals';
import { EstadoResolucionFuente, RolUsuario } from '@normativo/dominio';
import { ActualizarFuenteEdicionRegistroOficial } from '../ActualizarFuenteEdicionRegistroOficial';
import {
  crearEdicionRegistroOficial,
  crearUsuarioEditorial,
  RepositorioEdicionesRegistroOficialEnMemoriaFake,
  RepositorioUsuariosEnMemoriaFake,
} from './apoyo/fakes-normas-editorial';

const URL_CORREGIDA =
  'https://www.registroficial.gob.ec/ediciones/ro-500-corregida.pdf';

describe('ActualizarFuenteEdicionRegistroOficial (corrección manual)', () => {
  let repositorioUsuarios: RepositorioUsuariosEnMemoriaFake;
  let repositorioEdiciones: RepositorioEdicionesRegistroOficialEnMemoriaFake;
  let casoUso: ActualizarFuenteEdicionRegistroOficial;

  beforeEach(() => {
    repositorioUsuarios = new RepositorioUsuariosEnMemoriaFake();
    repositorioEdiciones = new RepositorioEdicionesRegistroOficialEnMemoriaFake();
    for (const rol of [
      RolUsuario.SUPERADMINISTRADOR,
      RolUsuario.EDITOR,
      RolUsuario.ADMINISTRADOR,
      RolUsuario.SUSCRIPTOR,
    ]) {
      repositorioUsuarios.agregar(crearUsuarioEditorial(rol));
    }
    repositorioEdiciones.agregar(
      crearEdicionRegistroOficial({
        urlPdf: null,
        estadoResolucionFuente: EstadoResolucionFuente.NO_ENCONTRADA,
      }),
    );
    casoUso = new ActualizarFuenteEdicionRegistroOficial({
      repositorioUsuarios,
      repositorioEdiciones,
    });
  });

  it.each([RolUsuario.EDITOR, RolUsuario.SUPERADMINISTRADOR])(
    '%s corrige la fuente: urlPdf nueva y estado MANUAL',
    async (rol) => {
      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: `usuario-${rol}`,
        edicionId: 'edicion-1',
        urlPdf: URL_CORREGIDA,
      });

      expect(resultado).toEqual({
        exitoso: true,
        edicion: {
          id: 'edicion-1',
          tipoPublicacionRegistroOficial: 'RO',
          numeroPublicacionRegistroOficial: 500,
          fechaPublicacionOficial: '2026-05-02',
          urlPdf: URL_CORREGIDA,
          estadoResolucionFuente: EstadoResolucionFuente.MANUAL,
        },
      });
      const persistida = await repositorioEdiciones.buscarPorId('edicion-1');
      expect(persistida?.urlPdf).toBe(URL_CORREGIDA);
      expect(persistida?.estadoResolucionFuente).toBe(
        EstadoResolucionFuente.MANUAL,
      );
    },
  );

  it('puede sobrescribir una fuente ya RESUELTA (corrección editorial)', async () => {
    repositorioEdiciones.agregar(
      crearEdicionRegistroOficial({ id: 'edicion-resuelta' }),
    );

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      edicionId: 'edicion-resuelta',
      urlPdf: URL_CORREGIDA,
    });

    expect(resultado.exitoso).toBe(true);
    const persistida = await repositorioEdiciones.buscarPorId('edicion-resuelta');
    expect(persistida?.urlPdf).toBe(URL_CORREGIDA);
    expect(persistida?.estadoResolucionFuente).toBe(
      EstadoResolucionFuente.MANUAL,
    );
  });

  it.each([RolUsuario.ADMINISTRADOR, RolUsuario.SUSCRIPTOR])(
    '%s no puede corregir la fuente (ACCESO_DENEGADO)',
    async (rol) => {
      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: `usuario-${rol}`,
        edicionId: 'edicion-1',
        urlPdf: URL_CORREGIDA,
      });

      expect(resultado).toEqual({ exitoso: false, razon: 'ACCESO_DENEGADO' });
      expect(repositorioEdiciones.guardadas).toHaveLength(0);
    },
  );

  it('usuario inexistente devuelve USUARIO_NO_ENCONTRADO', async () => {
    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-fantasma',
      edicionId: 'edicion-1',
      urlPdf: URL_CORREGIDA,
    });

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'USUARIO_NO_ENCONTRADO',
    });
  });

  it('edición inexistente devuelve EDICION_NO_ENCONTRADA', async () => {
    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      edicionId: 'edicion-fantasma',
      urlPdf: URL_CORREGIDA,
    });

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'EDICION_NO_ENCONTRADA',
    });
  });

  it.each([
    ['usuario vacío', { usuarioAutenticadoId: '  ' }],
    ['edición vacía', { edicionId: '' }],
    ['url vacía', { urlPdf: '   ' }],
    ['url inválida', { urlPdf: 'no es una url' }],
  ])('devuelve SOLICITUD_INVALIDA con %s', async (_nombre, parcial) => {
    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      edicionId: 'edicion-1',
      urlPdf: URL_CORREGIDA,
      ...parcial,
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
    expect(repositorioEdiciones.guardadas).toHaveLength(0);
  });
});
