import { beforeEach, describe, expect, it } from '@jest/globals';
import { EstadoResolucionFuente, RolUsuario } from '@normativo/dominio';
import { ConsultarEdicionesRegistroOficial } from '../ConsultarEdicionesRegistroOficial';
import {
  crearEdicionRegistroOficial,
  crearSuscripcionActivaPara,
  crearUsuarioEditorial,
  RepositorioEdicionesRegistroOficialEnMemoriaFake,
  RepositorioSuscripcionesEnMemoriaFake,
  RepositorioUsuariosEnMemoriaFake,
} from './apoyo/fakes-normas-editorial';

describe('ConsultarEdicionesRegistroOficial', () => {
  let repositorioUsuarios: RepositorioUsuariosEnMemoriaFake;
  let repositorioEdiciones: RepositorioEdicionesRegistroOficialEnMemoriaFake;
  let repositorioSuscripciones: RepositorioSuscripcionesEnMemoriaFake;
  let casoUso: ConsultarEdicionesRegistroOficial;

  beforeEach(() => {
    repositorioUsuarios = new RepositorioUsuariosEnMemoriaFake();
    repositorioEdiciones = new RepositorioEdicionesRegistroOficialEnMemoriaFake();
    repositorioSuscripciones = new RepositorioSuscripcionesEnMemoriaFake();
    for (const rol of Object.values(RolUsuario)) {
      repositorioUsuarios.agregar(crearUsuarioEditorial(rol));
    }
    casoUso = new ConsultarEdicionesRegistroOficial({
      repositorioUsuarios,
      repositorioEdiciones,
      repositorioSuscripciones,
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

  it('ADMINISTRADOR consulta sin suscripción solo ediciones completas y sin estado interno', async () => {
    repositorioEdiciones.agregar(crearEdicionRegistroOficial());
    repositorioEdiciones.agregar(
      crearEdicionRegistroOficial({
        id: 'edicion-pendiente',
        numeroPublicacionRegistroOficial: 501,
        urlPdf: null,
        estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
      }),
    );

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-ADMINISTRADOR',
    });

    expect(resultado).toEqual({
      exitoso: true,
      ediciones: [
        {
          id: 'edicion-1',
          tipoPublicacionRegistroOficial: 'RO',
          numeroPublicacionRegistroOficial: 500,
          fechaPublicacionOficial: '2026-05-02',
          urlPdf: 'https://www.registroficial.gob.ec/ediciones/ro-500.pdf',
        },
      ],
    });
    expect(repositorioSuscripciones.consultas).toEqual([]);
  });

  it('SUSCRIPTOR con cuenta y suscripción activa consulta solo ediciones completas y sin estado interno', async () => {
    const suscriptor = crearUsuarioEditorial(RolUsuario.SUSCRIPTOR);
    repositorioSuscripciones.agregar(crearSuscripcionActivaPara(suscriptor));
    repositorioEdiciones.agregar(crearEdicionRegistroOficial());
    repositorioEdiciones.agregar(
      crearEdicionRegistroOficial({
        id: 'edicion-pendiente',
        numeroPublicacionRegistroOficial: 501,
        urlPdf: null,
        estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
      }),
    );

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-SUSCRIPTOR',
      fechaReferencia: new Date('2026-07-22T00:00:00.000Z'),
    });

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) return;
    expect(resultado.ediciones.map((edicion) => edicion.id)).toEqual([
      'edicion-1',
    ]);
    expect(resultado.ediciones[0]).not.toHaveProperty(
      'estadoResolucionFuente',
    );
  });

  it('SUSCRIPTOR sin cuenta/suscripción no consulta el catálogo', async () => {
    await expect(
      casoUso.ejecutar({
        usuarioAutenticadoId: 'usuario-SUSCRIPTOR',
        fechaReferencia: new Date('2026-07-22T00:00:00.000Z'),
      }),
    ).resolves.toEqual({
      exitoso: false,
      razon: 'SUSCRIPCION_NO_ENCONTRADA',
    });
  });

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
