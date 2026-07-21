import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  EstadoEditorialNorma,
  EstadoResolucionFuente,
  RolUsuario,
} from '@normativo/dominio';
import { Norma } from '@normativo/dominio';
import { PublicarNormas } from '../PublicarNormas';
import {
  EventoNormaPublicada,
} from '../../puertos/PublicadorEventosNormas';
import {
  ResultadoGuardarPublicacion,
  UnidadDeTrabajoPublicacionNorma,
} from '../../puertos/UnidadDeTrabajoPublicacionNorma';
import {
  crearEdicionRegistroOficial,
  crearNormaEditorial,
  crearUsuarioEditorial,
  PublicadorEventosEnMemoriaFake,
  RepositorioEdicionesRegistroOficialEnMemoriaFake,
  RepositorioNormasEnMemoriaFake,
  RepositorioUsuariosEnMemoriaFake,
  UnidadDeTrabajoPublicacionNormaFake,
} from './apoyo/fakes-normas-editorial';

describe('PublicarNormas (publicación múltiple parcial)', () => {
  let repositorioUsuarios: RepositorioUsuariosEnMemoriaFake;
  let repositorioNormas: RepositorioNormasEnMemoriaFake;
  let repositorioEdiciones: RepositorioEdicionesRegistroOficialEnMemoriaFake;
  let publicador: PublicadorEventosEnMemoriaFake;
  let casoUso: PublicarNormas;

  const fechaPublicacion = new Date('2026-06-01T12:00:00.000Z');

  beforeEach(() => {
    repositorioUsuarios = new RepositorioUsuariosEnMemoriaFake();
    repositorioNormas = new RepositorioNormasEnMemoriaFake();
    repositorioEdiciones = new RepositorioEdicionesRegistroOficialEnMemoriaFake();
    publicador = new PublicadorEventosEnMemoriaFake();
    repositorioEdiciones.agregar(crearEdicionRegistroOficial());
    for (const rol of [
      RolUsuario.SUPERADMINISTRADOR,
      RolUsuario.EDITOR,
      RolUsuario.ADMINISTRADOR,
      RolUsuario.SUSCRIPTOR,
    ]) {
      repositorioUsuarios.agregar(crearUsuarioEditorial(rol));
    }
    casoUso = new PublicarNormas({
      repositorioUsuarios,
      repositorioNormas,
      repositorioEdiciones,
      unidadDeTrabajoPublicacionNorma: new UnidadDeTrabajoPublicacionNormaFake(
        repositorioNormas,
        publicador,
      ),
    });
  });

  it.each([RolUsuario.EDITOR, RolUsuario.SUPERADMINISTRADOR])(
    '%s publica varias normas válidas de una vez',
    async (rol) => {
      repositorioNormas.agregar(crearNormaEditorial({ id: 'norma-1' }));
      repositorioNormas.agregar(crearNormaEditorial({ id: 'norma-2' }));

      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: `usuario-${rol}`,
        normaIds: ['norma-1', 'norma-2'],
        fechaPublicacionEnSistema: fechaPublicacion,
      });

      expect(resultado.exitoso).toBe(true);
      if (!resultado.exitoso) {
        return;
      }
      expect(resultado.resultados).toEqual([
        {
          normaId: 'norma-1',
          publicada: true,
          estadoEditorial: EstadoEditorialNorma.PUBLICADA,
        },
        {
          normaId: 'norma-2',
          publicada: true,
          estadoEditorial: EstadoEditorialNorma.PUBLICADA,
        },
      ]);
      for (const id of ['norma-1', 'norma-2']) {
        const publicada = await repositorioNormas.buscarPorId(id);
        expect(publicada?.estaPublicada()).toBe(true);
        expect(publicada?.fechaPublicacionEnSistema).toEqual(fechaPublicacion);
      }
      expect(publicador.eventos).toHaveLength(2);
    },
  );

  it('una norma inválida no bloquea a las demás (publicación parcial)', async () => {
    // La edición pendiente (sin urlPdf) bloquea a la norma-3 por fuente.
    repositorioEdiciones.agregar(
      crearEdicionRegistroOficial({
        id: 'edicion-pendiente',
        urlPdf: null,
        estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
      }),
    );
    repositorioNormas.agregar(crearNormaEditorial({ id: 'norma-1' }));
    repositorioNormas.agregar(
      crearNormaEditorial({ id: 'norma-2', titulo: '' }),
    );
    repositorioNormas.agregar(
      crearNormaEditorial({
        id: 'norma-3',
        edicionRegistroOficialId: 'edicion-pendiente',
      }),
    );

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      normaIds: ['norma-1', 'norma-2', 'norma-3'],
      fechaPublicacionEnSistema: fechaPublicacion,
    });

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) {
      return;
    }
    expect(resultado.resultados).toEqual([
      {
        normaId: 'norma-1',
        publicada: true,
        estadoEditorial: EstadoEditorialNorma.PUBLICADA,
      },
      { normaId: 'norma-2', publicada: false, razon: 'TITULO_REQUERIDO' },
      { normaId: 'norma-3', publicada: false, razon: 'FUENTE_REQUERIDA' },
    ]);
    expect((await repositorioNormas.buscarPorId('norma-1'))?.estaPublicada()).toBe(true);
    expect((await repositorioNormas.buscarPorId('norma-2'))?.estaPublicada()).toBe(false);
    expect((await repositorioNormas.buscarPorId('norma-3'))?.estaPublicada()).toBe(false);
    expect(publicador.eventos).toHaveLength(1);
  });

  it('no exige numero, fechaExpedicion ni contenido para publicar', async () => {
    repositorioNormas.agregar(
      crearNormaEditorial({
        id: 'norma-1',
        numero: null,
        fechaExpedicion: null,
        contenido: [],
      }),
    );

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      normaIds: ['norma-1'],
      fechaPublicacionEnSistema: fechaPublicacion,
    });

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(resultado.resultados[0]).toEqual({
        normaId: 'norma-1',
        publicada: true,
        estadoEditorial: EstadoEditorialNorma.PUBLICADA,
      });
    }
    expect(publicador.eventos[0]?.tieneContenidoCompleto).toBe(false);
  });

  it('norma inexistente y norma ya publicada se reportan por norma', async () => {
    repositorioNormas.agregar(
      crearNormaEditorial({
        id: 'norma-publicada',
        estadoEditorial: EstadoEditorialNorma.PUBLICADA,
        fechaPublicacionEnSistema: new Date('2026-05-01'),
      }),
    );

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      normaIds: ['norma-fantasma', 'norma-publicada'],
      fechaPublicacionEnSistema: fechaPublicacion,
    });

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(resultado.resultados).toEqual([
        {
          normaId: 'norma-fantasma',
          publicada: false,
          razon: 'NORMA_NO_ENCONTRADA',
        },
        {
          normaId: 'norma-publicada',
          publicada: false,
          razon: 'NORMA_YA_PUBLICADA',
        },
      ]);
    }
  });

  it('una norma que pierde la carrera se reporta como NORMA_YA_PUBLICADA y las siguientes continúan en orden', async () => {
    // La unidad de trabajo pierde la carrera únicamente para norma-2.
    const unidadConCarrera: UnidadDeTrabajoPublicacionNorma = {
      async guardarNormaPublicadaConEvento(
        normaPublicada: Norma,
        evento: EventoNormaPublicada,
      ): Promise<ResultadoGuardarPublicacion> {
        if (normaPublicada.id === 'norma-2') {
          return { publicada: false, razon: 'NORMA_YA_PUBLICADA' };
        }
        await repositorioNormas.guardar(normaPublicada);
        await publicador.publicarNormaPublicada(evento);
        return {
          publicada: true,
          tieneContenidoCompleto: normaPublicada.tieneContenidoCompleto(),
        };
      },
    };
    const casoUsoConCarrera = new PublicarNormas({
      repositorioUsuarios,
      repositorioNormas,
      repositorioEdiciones,
      unidadDeTrabajoPublicacionNorma: unidadConCarrera,
    });
    repositorioNormas.agregar(crearNormaEditorial({ id: 'norma-1' }));
    repositorioNormas.agregar(crearNormaEditorial({ id: 'norma-2' }));
    repositorioNormas.agregar(crearNormaEditorial({ id: 'norma-3' }));

    const resultado = await casoUsoConCarrera.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      normaIds: ['norma-1', 'norma-2', 'norma-3'],
      fechaPublicacionEnSistema: fechaPublicacion,
    });

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) {
      return;
    }
    expect(resultado.resultados).toEqual([
      {
        normaId: 'norma-1',
        publicada: true,
        estadoEditorial: EstadoEditorialNorma.PUBLICADA,
      },
      {
        normaId: 'norma-2',
        publicada: false,
        razon: 'NORMA_YA_PUBLICADA',
      },
      {
        normaId: 'norma-3',
        publicada: true,
        estadoEditorial: EstadoEditorialNorma.PUBLICADA,
      },
    ]);
    expect(publicador.eventos.map((evento) => evento.normaId)).toEqual([
      'norma-1',
      'norma-3',
    ]);
  });

  it('una norma modificada concurrentemente se reporta como NORMA_MODIFICADA_CONCURRENTEMENTE sin abortar el lote', async () => {
    // La barrera atómica rechaza únicamente norma-1; norma-2 se publica.
    const unidadConModificacionConcurrente: UnidadDeTrabajoPublicacionNorma = {
      async guardarNormaPublicadaConEvento(
        normaPublicada: Norma,
        evento: EventoNormaPublicada,
      ): Promise<ResultadoGuardarPublicacion> {
        if (normaPublicada.id === 'norma-1') {
          return {
            publicada: false,
            razon: 'NORMA_MODIFICADA_CONCURRENTEMENTE',
          };
        }
        await repositorioNormas.guardar(normaPublicada);
        await publicador.publicarNormaPublicada(evento);
        return {
          publicada: true,
          tieneContenidoCompleto: normaPublicada.tieneContenidoCompleto(),
        };
      },
    };
    const casoUsoConConflicto = new PublicarNormas({
      repositorioUsuarios,
      repositorioNormas,
      repositorioEdiciones,
      unidadDeTrabajoPublicacionNorma: unidadConModificacionConcurrente,
    });
    repositorioNormas.agregar(crearNormaEditorial({ id: 'norma-1' }));
    repositorioNormas.agregar(crearNormaEditorial({ id: 'norma-2' }));

    const resultado = await casoUsoConConflicto.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      normaIds: ['norma-1', 'norma-2'],
      fechaPublicacionEnSistema: fechaPublicacion,
    });

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) {
      return;
    }
    // Conserva el orden y el conflicto esperado no aborta el lote.
    expect(resultado.resultados).toEqual([
      {
        normaId: 'norma-1',
        publicada: false,
        razon: 'NORMA_MODIFICADA_CONCURRENTEMENTE',
      },
      {
        normaId: 'norma-2',
        publicada: true,
        estadoEditorial: EstadoEditorialNorma.PUBLICADA,
      },
    ]);
    expect(publicador.eventos.map((evento) => evento.normaId)).toEqual([
      'norma-2',
    ]);
  });

  it('un fallo desconocido de infraestructura se propaga y no se oculta como conflicto', async () => {
    const errorInfraestructura = new Error('Conexión perdida con la base');
    const unidadFallida: UnidadDeTrabajoPublicacionNorma = {
      async guardarNormaPublicadaConEvento(): Promise<never> {
        throw errorInfraestructura;
      },
    };
    const casoUsoFallido = new PublicarNormas({
      repositorioUsuarios,
      repositorioNormas,
      repositorioEdiciones,
      unidadDeTrabajoPublicacionNorma: unidadFallida,
    });
    repositorioNormas.agregar(crearNormaEditorial({ id: 'norma-1' }));

    await expect(
      casoUsoFallido.ejecutar({
        usuarioAutenticadoId: 'usuario-EDITOR',
        normaIds: ['norma-1'],
        fechaPublicacionEnSistema: fechaPublicacion,
      }),
    ).rejects.toBe(errorInfraestructura);
  });

  it.each([RolUsuario.ADMINISTRADOR, RolUsuario.SUSCRIPTOR])(
    '%s no puede publicar en lote (ACCESO_DENEGADO)',
    async (rol) => {
      repositorioNormas.agregar(crearNormaEditorial({ id: 'norma-1' }));

      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: `usuario-${rol}`,
        normaIds: ['norma-1'],
      });

      expect(resultado).toEqual({ exitoso: false, razon: 'ACCESO_DENEGADO' });
      expect((await repositorioNormas.buscarPorId('norma-1'))?.estaPublicada()).toBe(false);
    },
  );

  it('usuario inexistente devuelve USUARIO_NO_ENCONTRADO', async () => {
    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-fantasma',
      normaIds: ['norma-1'],
    });

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'USUARIO_NO_ENCONTRADO',
    });
  });

  it.each([
    ['lista vacía', []],
    ['id vacío', ['norma-1', '  ']],
    ['ids duplicados', ['norma-1', 'norma-1']],
  ])('devuelve SOLICITUD_INVALIDA con %s', async (_nombre, normaIds) => {
    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      normaIds: normaIds as string[],
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
  });
});
