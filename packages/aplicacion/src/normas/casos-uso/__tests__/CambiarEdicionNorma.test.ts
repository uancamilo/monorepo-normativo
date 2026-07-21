import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  EstadoEditorialNorma,
  EstadoResolucionFuente,
  RolUsuario,
} from '@normativo/dominio';
import { CambiarEdicionNorma } from '../CambiarEdicionNorma';
import {
  crearEdicionRegistroOficial,
  crearNormaEditorial,
  crearUsuarioEditorial,
  ConsultorOrigenRegistroOficialFake,
  RepositorioEdicionesRegistroOficialEnMemoriaFake,
  RepositorioNormasEnMemoriaFake,
  RepositorioUsuariosEnMemoriaFake,
} from './apoyo/fakes-normas-editorial';

describe('CambiarEdicionNorma', () => {
  let repositorioUsuarios: RepositorioUsuariosEnMemoriaFake;
  let repositorioNormas: RepositorioNormasEnMemoriaFake;
  let repositorioEdiciones: RepositorioEdicionesRegistroOficialEnMemoriaFake;
  let consultorOrigen: ConsultorOrigenRegistroOficialFake;
  let casoUso: CambiarEdicionNorma;

  beforeEach(() => {
    repositorioUsuarios = new RepositorioUsuariosEnMemoriaFake();
    repositorioNormas = new RepositorioNormasEnMemoriaFake();
    repositorioEdiciones = new RepositorioEdicionesRegistroOficialEnMemoriaFake();
    consultorOrigen = new ConsultorOrigenRegistroOficialFake();
    for (const rol of Object.values(RolUsuario)) {
      repositorioUsuarios.agregar(crearUsuarioEditorial(rol));
    }
    repositorioEdiciones.agregar(crearEdicionRegistroOficial());
    repositorioEdiciones.agregar(
      crearEdicionRegistroOficial({
        id: 'edicion-2',
        tipoPublicacionRegistroOficial: 'SRO',
        numeroPublicacionRegistroOficial: 600,
        fechaPublicacionOficial: new Date('2026-06-02'),
        urlPdf: 'https://www.registroficial.gob.ec/ediciones/sro-600.pdf',
        estadoResolucionFuente: EstadoResolucionFuente.MANUAL,
      }),
    );
    casoUso = new CambiarEdicionNorma({
      repositorioUsuarios,
      repositorioNormas,
      repositorioEdiciones,
      consultorOrigenRegistroOficial: consultorOrigen,
    });
  });

  it.each([RolUsuario.EDITOR, RolUsuario.SUPERADMINISTRADOR])(
    '%s reemplaza la principal y conserva la anterior como CAMBIO en la proyección',
    async (rol) => {
      repositorioNormas.agregar(crearNormaEditorial());

      const resultado = await casoUso.ejecutar(solicitudValida(rol));

      expect(resultado.exitoso).toBe(true);
      if (!resultado.exitoso) return;
      expect(resultado.norma.id).toBe('norma-1');
      expect(resultado.norma.estadoEditorial).toBe(EstadoEditorialNorma.BORRADOR);
      expect(resultado.norma.edicionesRegistroOficial).toEqual([
        {
          tipoRelacion: 'PRINCIPAL',
          id: 'edicion-2',
          tipoPublicacionRegistroOficial: 'SRO',
          numeroPublicacionRegistroOficial: 600,
          fechaPublicacionOficial: '2026-06-02',
          fuente: 'https://www.registroficial.gob.ec/ediciones/sro-600.pdf',
        },
        {
          tipoRelacion: 'CAMBIO',
          id: 'edicion-1',
          tipoPublicacionRegistroOficial: 'RO',
          numeroPublicacionRegistroOficial: 500,
          fechaPublicacionOficial: '2026-05-02',
          fuente: 'https://www.registroficial.gob.ec/ediciones/ro-500.pdf',
        },
      ]);
      expect(resultado.norma.estadoResolucionFuente).toBe(
        EstadoResolucionFuente.MANUAL,
      );
      expect(resultado.norma).not.toHaveProperty('edicionRegistroOficialId');
      expect(resultado.norma).not.toHaveProperty('fuente');

      const persistida = await repositorioNormas.buscarPorId('norma-1');
      expect(persistida?.edicionRegistroOficialId).toBe('edicion-2');
      expect(persistida?.titulo).toBe('Acuerdo Ministerial 123');
      expect(await repositorioNormas.buscarCambiosPorNormaId('norma-1')).toEqual([
        'edicion-1',
      ]);
      expect(repositorioEdiciones.guardadas).toHaveLength(0);
    },
  );

  it('reemplazar por la misma principal es idempotente (no crea cambios)', async () => {
    repositorioNormas.agregar(crearNormaEditorial());

    const resultado = await casoUso.ejecutar({
      ...solicitudValida(RolUsuario.EDITOR),
      edicionRegistroOficialId: 'edicion-1',
    });

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) return;
    expect(
      resultado.norma.edicionesRegistroOficial.map((e) => [e.tipoRelacion, e.id]),
    ).toEqual([['PRINCIPAL', 'edicion-1']]);
    expect(await repositorioNormas.buscarCambiosPorNormaId('norma-1')).toEqual([]);
  });

  it('conserva origenRegistroOficial al reemplazar la principal', async () => {
    repositorioNormas.agregar(crearNormaEditorial());
    consultorOrigen.registrar('norma-1', {
      urlResumenMensualRegistroOficial: 'https://registroficial.gob.ec/resumen.pdf',
      segmentoCrudo: 'Segmento detectado',
    });

    const resultado = await casoUso.ejecutar(solicitudValida(RolUsuario.EDITOR));

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) return;
    expect(resultado.norma.origenRegistroOficial).toEqual({
      urlResumenMensualRegistroOficial: 'https://registroficial.gob.ec/resumen.pdf',
      segmentoCrudo: 'Segmento detectado',
    });
  });

  it('la nueva principal deja de aparecer como CAMBIO si ya estaba asociada allí', async () => {
    repositorioNormas.agregar(crearNormaEditorial());
    // edicion-2 ya era un cambio de la norma antes de promoverla a principal.
    repositorioNormas.agregarCambio('norma-1', 'edicion-2');

    const resultado = await casoUso.ejecutar(solicitudValida(RolUsuario.EDITOR));

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) return;
    // edicion-2 es ahora la principal (no duplicada como cambio) y la anterior
    // (edicion-1) pasa a cambio.
    expect(
      resultado.norma.edicionesRegistroOficial.map((e) => [e.tipoRelacion, e.id]),
    ).toEqual([
      ['PRINCIPAL', 'edicion-2'],
      ['CAMBIO', 'edicion-1'],
    ]);
    expect(await repositorioNormas.buscarCambiosPorNormaId('norma-1')).toEqual([
      'edicion-1',
    ]);
  });

  it('permite reasociar directamente una norma PUBLICADA a otra edición válida', async () => {
    repositorioNormas.agregar(
      crearNormaEditorial({
        estadoEditorial: EstadoEditorialNorma.PUBLICADA,
        fechaPublicacionEnSistema: new Date('2026-06-10'),
      }),
    );

    const resultado = await casoUso.ejecutar(
      solicitudValida(RolUsuario.EDITOR),
    );

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(resultado.norma.estadoEditorial).toBe(
        EstadoEditorialNorma.PUBLICADA,
      );
      expect(resultado.norma.edicionesRegistroOficial[0]).toMatchObject({
        tipoRelacion: 'PRINCIPAL',
        id: 'edicion-2',
      });
    }
  });

  it('el cambio de edición modifica únicamente la asociación: el resto de la norma queda intacto', async () => {
    const original = crearNormaEditorial({
      contenido: ['Texto original'],
      fechaExpedicion: new Date('2026-04-01'),
    });
    repositorioNormas.agregar(original);

    const resultado = await casoUso.ejecutar(solicitudValida(RolUsuario.EDITOR));

    expect(resultado.exitoso).toBe(true);
    const persistida = await repositorioNormas.buscarPorId('norma-1');
    expect(persistida?.edicionRegistroOficialId).toBe('edicion-2');
    expect(persistida?.titulo).toBe(original.titulo);
    expect(persistida?.numero).toBe(original.numero);
    expect(persistida?.contenido).toEqual(original.contenido);
    expect(persistida?.tipoNorma).toBe(original.tipoNorma);
    expect(persistida?.institucionExpide).toBe(original.institucionExpide);
    expect(persistida?.estadoJuridico).toBe(original.estadoJuridico);
    expect(persistida?.fechaExpedicion).toEqual(original.fechaExpedicion);
    expect(persistida?.estadoEditorial).toBe(original.estadoEditorial);
  });

  it('una norma PUBLICADA puede cambiar a una edición RESUELTA con urlPdf', async () => {
    repositorioEdiciones.agregar(
      crearEdicionRegistroOficial({
        id: 'edicion-resuelta',
        numeroPublicacionRegistroOficial: 700,
        urlPdf: 'https://www.registroficial.gob.ec/ediciones/ro-700.pdf',
        estadoResolucionFuente: EstadoResolucionFuente.RESUELTA,
      }),
    );
    repositorioNormas.agregar(
      crearNormaEditorial({
        estadoEditorial: EstadoEditorialNorma.PUBLICADA,
        fechaPublicacionEnSistema: new Date('2026-06-10'),
      }),
    );

    const resultado = await casoUso.ejecutar({
      ...solicitudValida(RolUsuario.EDITOR),
      edicionRegistroOficialId: 'edicion-resuelta',
    });

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(resultado.norma.edicionesRegistroOficial[0]).toMatchObject({
        tipoRelacion: 'PRINCIPAL',
        id: 'edicion-resuelta',
      });
      expect(resultado.norma.estadoEditorial).toBe(
        EstadoEditorialNorma.PUBLICADA,
      );
    }
  });

  it.each([
    EstadoResolucionFuente.PENDIENTE,
    EstadoResolucionFuente.NO_ENCONTRADA,
    EstadoResolucionFuente.CONFLICTIVA,
  ])(
    'una norma PUBLICADA no puede cambiar a una edición %s sin urlPdf (FUENTE_REQUERIDA)',
    async (estadoResolucionFuente) => {
      repositorioEdiciones.agregar(
        crearEdicionRegistroOficial({
          id: 'edicion-no-publicable',
          numeroPublicacionRegistroOficial: 800,
          urlPdf: null,
          estadoResolucionFuente,
        }),
      );
      repositorioNormas.agregar(
        crearNormaEditorial({
          estadoEditorial: EstadoEditorialNorma.PUBLICADA,
          fechaPublicacionEnSistema: new Date('2026-06-10'),
        }),
      );

      const resultado = await casoUso.ejecutar({
        ...solicitudValida(RolUsuario.EDITOR),
        edicionRegistroOficialId: 'edicion-no-publicable',
      });

      expect(resultado).toEqual({
        exitoso: false,
        razon: 'FUENTE_REQUERIDA',
      });
      const persistida = await repositorioNormas.buscarPorId('norma-1');
      expect(persistida?.edicionRegistroOficialId).toBe('edicion-1');
    },
  );

  it('una norma BORRADOR sí puede cambiar a una edición PENDIENTE sin urlPdf', async () => {
    repositorioEdiciones.agregar(
      crearEdicionRegistroOficial({
        id: 'edicion-pendiente',
        numeroPublicacionRegistroOficial: 900,
        urlPdf: null,
        estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
      }),
    );
    repositorioNormas.agregar(crearNormaEditorial());

    const resultado = await casoUso.ejecutar({
      ...solicitudValida(RolUsuario.EDITOR),
      edicionRegistroOficialId: 'edicion-pendiente',
    });

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(resultado.norma.edicionesRegistroOficial[0]).toMatchObject({
        tipoRelacion: 'PRINCIPAL',
        id: 'edicion-pendiente',
      });
    }
  });

  it('un cambio de estado concurrente no se informa como éxito', async () => {
    // La lectura devuelve la copia BORRADOR pero otra transacción publica la
    // norma antes de persistir el cambio de edición.
    const repositorioConCarrera = new (class extends RepositorioNormasEnMemoriaFake {
      async buscarPorId(id: string) {
        const norma = await super.buscarPorId(id);
        if (norma !== null && !norma.estaPublicada()) {
          await super.guardar(norma.publicar(new Date('2026-06-15')));
        }
        return norma;
      }
    })();
    repositorioConCarrera.agregar(crearNormaEditorial());
    const casoUsoConCarrera = new CambiarEdicionNorma({
      repositorioUsuarios,
      repositorioNormas: repositorioConCarrera,
      repositorioEdiciones,
      consultorOrigenRegistroOficial: consultorOrigen,
    });

    const resultado = await casoUsoConCarrera.ejecutar(
      solicitudValida(RolUsuario.EDITOR),
    );

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'ESTADO_EDITORIAL_CAMBIO_CONCURRENTE',
    });
    // La operación basada en estado obsoleto no se aplicó.
    const persistida = await repositorioConCarrera.buscarPorId('norma-1');
    expect(persistida?.edicionRegistroOficialId).toBe('edicion-1');
    expect(persistida?.estaPublicada()).toBe(true);
  });

  it('devuelve EDICION_NO_ENCONTRADA sin modificar la norma', async () => {
    repositorioNormas.agregar(crearNormaEditorial());

    const resultado = await casoUso.ejecutar({
      ...solicitudValida(RolUsuario.EDITOR),
      edicionRegistroOficialId: 'edicion-fantasma',
    });

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'EDICION_NO_ENCONTRADA',
    });
    expect((await repositorioNormas.buscarPorId('norma-1'))?.edicionRegistroOficialId)
      .toBe('edicion-1');
  });

  it('devuelve NORMA_NO_ENCONTRADA', async () => {
    await expect(
      casoUso.ejecutar(solicitudValida(RolUsuario.EDITOR)),
    ).resolves.toEqual({ exitoso: false, razon: 'NORMA_NO_ENCONTRADA' });
  });

  it.each([RolUsuario.ADMINISTRADOR, RolUsuario.SUSCRIPTOR])(
    '%s no puede cambiar la edición',
    async (rol) => {
      repositorioNormas.agregar(crearNormaEditorial());

      await expect(casoUso.ejecutar(solicitudValida(rol))).resolves.toEqual({
        exitoso: false,
        razon: 'ACCESO_DENEGADO',
      });
      expect(repositorioNormas.guardadas).toHaveLength(0);
    },
  );

  it('no permite eliminar la asociación con null', async () => {
    repositorioNormas.agregar(crearNormaEditorial());

    const resultado = await casoUso.ejecutar({
      ...solicitudValida(RolUsuario.EDITOR),
      edicionRegistroOficialId: null,
    } as never);

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
    expect(repositorioNormas.guardadas).toHaveLength(0);
  });
});

function solicitudValida(rol: RolUsuario) {
  return {
    usuarioAutenticadoId: `usuario-${rol}`,
    normaId: 'norma-1',
    edicionRegistroOficialId: 'edicion-2',
  };
}
