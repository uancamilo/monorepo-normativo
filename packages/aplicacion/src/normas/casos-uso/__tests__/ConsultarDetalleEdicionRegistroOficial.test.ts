import { beforeEach, describe, expect, it } from '@jest/globals';
import { EstadoResolucionFuente, RolUsuario } from '@normativo/dominio';
import { ConsultarDetalleEdicionRegistroOficial } from '../ConsultarDetalleEdicionRegistroOficial';
import {
  crearEdicionRegistroOficial,
  crearUsuarioEditorial,
  RepositorioEdicionesRegistroOficialEnMemoriaFake,
  RepositorioUsuariosEnMemoriaFake,
} from './apoyo/fakes-normas-editorial';

describe('ConsultarDetalleEdicionRegistroOficial', () => {
  let repositorioUsuarios: RepositorioUsuariosEnMemoriaFake;
  let repositorioEdiciones: RepositorioEdicionesRegistroOficialEnMemoriaFake;
  let casoUso: ConsultarDetalleEdicionRegistroOficial;

  beforeEach(() => {
    repositorioUsuarios = new RepositorioUsuariosEnMemoriaFake();
    repositorioEdiciones = new RepositorioEdicionesRegistroOficialEnMemoriaFake();
    for (const rol of Object.values(RolUsuario)) {
      repositorioUsuarios.agregar(crearUsuarioEditorial(rol));
    }
    repositorioEdiciones.agregar(
      crearEdicionRegistroOficial({
        estadoResolucionFuente: EstadoResolucionFuente.MANUAL,
      }),
    );
    casoUso = new ConsultarDetalleEdicionRegistroOficial({
      repositorioUsuarios,
      repositorioEdiciones,
    });
  });

  it.each([RolUsuario.EDITOR, RolUsuario.SUPERADMINISTRADOR])(
    '%s consulta el detalle editorial de la edición',
    async (rol) => {
      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: `usuario-${rol}`,
        edicionId: 'edicion-1',
      });

      expect(resultado).toEqual({
        exitoso: true,
        edicion: {
          id: 'edicion-1',
          tipoPublicacionRegistroOficial: 'RO',
          numeroPublicacionRegistroOficial: 500,
          fechaPublicacionOficial: '2026-05-02',
          urlPdf: 'https://www.registroficial.gob.ec/ediciones/ro-500.pdf',
          estadoResolucionFuente: EstadoResolucionFuente.MANUAL,
        },
      });
    },
  );

  it.each([RolUsuario.ADMINISTRADOR, RolUsuario.SUSCRIPTOR])(
    '%s no puede consultar el detalle del catálogo',
    async (rol) => {
      await expect(
        casoUso.ejecutar({
          usuarioAutenticadoId: `usuario-${rol}`,
          edicionId: 'edicion-1',
        }),
      ).resolves.toEqual({ exitoso: false, razon: 'ACCESO_DENEGADO' });
    },
  );

  it('devuelve EDICION_NO_ENCONTRADA sin filtrar datos internos', async () => {
    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      edicionId: 'edicion-fantasma',
    });

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'EDICION_NO_ENCONTRADA',
    });
  });
});
