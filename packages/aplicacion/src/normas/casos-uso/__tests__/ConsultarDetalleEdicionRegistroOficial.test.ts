import { beforeEach, describe, expect, it } from '@jest/globals';
import { EstadoResolucionFuente, RolUsuario } from '@normativo/dominio';
import { ConsultarDetalleEdicionRegistroOficial } from '../ConsultarDetalleEdicionRegistroOficial';
import {
  crearEdicionRegistroOficial,
  crearSuscripcionActivaPara,
  crearUsuarioEditorial,
  RepositorioEdicionesRegistroOficialEnMemoriaFake,
  RepositorioSuscripcionesEnMemoriaFake,
  RepositorioUsuariosEnMemoriaFake,
} from './apoyo/fakes-normas-editorial';

describe('ConsultarDetalleEdicionRegistroOficial', () => {
  let repositorioUsuarios: RepositorioUsuariosEnMemoriaFake;
  let repositorioEdiciones: RepositorioEdicionesRegistroOficialEnMemoriaFake;
  let repositorioSuscripciones: RepositorioSuscripcionesEnMemoriaFake;
  let casoUso: ConsultarDetalleEdicionRegistroOficial;

  beforeEach(() => {
    repositorioUsuarios = new RepositorioUsuariosEnMemoriaFake();
    repositorioEdiciones = new RepositorioEdicionesRegistroOficialEnMemoriaFake();
    repositorioSuscripciones = new RepositorioSuscripcionesEnMemoriaFake();
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
      repositorioSuscripciones,
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

  it('ADMINISTRADOR consulta una edición completa sin suscripción y sin estado interno', async () => {
    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-ADMINISTRADOR',
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
      },
    });
    expect(repositorioSuscripciones.consultas).toEqual([]);
  });

  it('SUSCRIPTOR con cuenta y suscripción consulta una edición completa sin estado interno', async () => {
    const suscriptor = crearUsuarioEditorial(RolUsuario.SUSCRIPTOR);
    repositorioSuscripciones.agregar(crearSuscripcionActivaPara(suscriptor));

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-SUSCRIPTOR',
      edicionId: 'edicion-1',
      fechaReferencia: new Date('2026-07-22T00:00:00.000Z'),
    });

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) return;
    expect(resultado.edicion).not.toHaveProperty('estadoResolucionFuente');
  });

  it.each([RolUsuario.ADMINISTRADOR, RolUsuario.SUSCRIPTOR])(
    '%s recibe EDICION_NO_ENCONTRADA al consultar una edición incompleta',
    async (rol) => {
      const usuario = crearUsuarioEditorial(rol);
      if (rol === RolUsuario.SUSCRIPTOR) {
        repositorioSuscripciones.agregar(crearSuscripcionActivaPara(usuario));
      }
      repositorioEdiciones.agregar(
        crearEdicionRegistroOficial({
          id: 'edicion-incompleta',
          urlPdf: null,
          estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
        }),
      );

      await expect(
        casoUso.ejecutar({
          usuarioAutenticadoId: `usuario-${rol}`,
          edicionId: 'edicion-incompleta',
          fechaReferencia: new Date('2026-07-22T00:00:00.000Z'),
        }),
      ).resolves.toEqual({
        exitoso: false,
        razon: 'EDICION_NO_ENCONTRADA',
      });
    },
  );

  it('SUSCRIPTOR sin cuenta/suscripción recibe SUSCRIPCION_NO_ENCONTRADA', async () => {
    await expect(
      casoUso.ejecutar({
        usuarioAutenticadoId: 'usuario-SUSCRIPTOR',
        edicionId: 'edicion-1',
        fechaReferencia: new Date('2026-07-22T00:00:00.000Z'),
      }),
    ).resolves.toEqual({
      exitoso: false,
      razon: 'SUSCRIPCION_NO_ENCONTRADA',
    });
  });

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
