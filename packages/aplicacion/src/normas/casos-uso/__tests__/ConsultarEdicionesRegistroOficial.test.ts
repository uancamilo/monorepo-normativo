import { beforeEach, describe, expect, it } from '@jest/globals';
import { EstadoResolucionFuente, RolUsuario } from '@normativo/dominio';
import { ConsultarEdicionesRegistroOficial } from '../ConsultarEdicionesRegistroOficial';
import {
  crearEdicionRegistroOficial,
  crearUsuarioEditorial,
  RepositorioEdicionesRegistroOficialEnMemoriaFake,
  RepositorioUsuariosEnMemoriaFake,
} from './apoyo/fakes-normas-editorial';

describe('ConsultarEdicionesRegistroOficial', () => {
  let repositorioUsuarios: RepositorioUsuariosEnMemoriaFake;
  let repositorioEdiciones: RepositorioEdicionesRegistroOficialEnMemoriaFake;
  let casoUso: ConsultarEdicionesRegistroOficial;

  beforeEach(() => {
    repositorioUsuarios = new RepositorioUsuariosEnMemoriaFake();
    repositorioEdiciones = new RepositorioEdicionesRegistroOficialEnMemoriaFake();
    for (const rol of Object.values(RolUsuario)) {
      repositorioUsuarios.agregar(crearUsuarioEditorial(rol));
    }
    casoUso = new ConsultarEdicionesRegistroOficial({
      repositorioUsuarios,
      repositorioEdiciones,
    });
  });

  it.each([RolUsuario.EDITOR, RolUsuario.SUPERADMINISTRADOR])(
    '%s consulta el catálogo ordenado por fecha descendente',
    async (rol) => {
      repositorioEdiciones.agregar(
        crearEdicionRegistroOficial({ id: 'edicion-antigua' }),
      );
      repositorioEdiciones.agregar(
        crearEdicionRegistroOficial({
          id: 'edicion-reciente',
          numeroPublicacionRegistroOficial: 600,
          fechaPublicacionOficial: new Date('2026-06-02'),
          urlPdf: null,
          estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
        }),
      );

      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: `usuario-${rol}`,
      });

      expect(resultado.exitoso).toBe(true);
      if (!resultado.exitoso) return;
      expect(resultado.ediciones.map((edicion) => edicion.id)).toEqual([
        'edicion-reciente',
        'edicion-antigua',
      ]);
      expect(resultado.ediciones[0]).toEqual({
        id: 'edicion-reciente',
        tipoPublicacionRegistroOficial: 'RO',
        numeroPublicacionRegistroOficial: 600,
        fechaPublicacionOficial: '2026-06-02',
        urlPdf: null,
        estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
      });
    },
  );

  it('devuelve una lista vacía', async () => {
    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
    });

    expect(resultado).toEqual({ exitoso: true, ediciones: [] });
  });

  it.each([RolUsuario.ADMINISTRADOR, RolUsuario.SUSCRIPTOR])(
    '%s no puede consultar el catálogo',
    async (rol) => {
      await expect(
        casoUso.ejecutar({ usuarioAutenticadoId: `usuario-${rol}` }),
      ).resolves.toEqual({ exitoso: false, razon: 'ACCESO_DENEGADO' });
    },
  );

  it('no expone datos técnicos de ingesta', async () => {
    repositorioEdiciones.agregar(crearEdicionRegistroOficial());

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
    });

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) return;
    for (const campo of [
      'segmentoCrudo',
      'loteId',
      'metadataExtraccion',
      'urlResumenMensualRegistroOficial',
    ]) {
      expect(resultado.ediciones[0]).not.toHaveProperty(campo);
    }
  });
});
