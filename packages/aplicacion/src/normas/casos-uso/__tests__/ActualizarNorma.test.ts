import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  EstadoEditorialNorma,
  EstadoNorma,
  RolUsuario,
} from '@normativo/dominio';
import { ActualizarNorma, CambiosActualizarNorma } from '../ActualizarNorma';
import {
  crearEdicionRegistroOficial,
  crearNormaEditorial,
  crearUsuarioEditorial,
  ConsultorOrigenRegistroOficialFake,
  RepositorioEdicionesRegistroOficialEnMemoriaFake,
  RepositorioNormasEnMemoriaFake,
  RepositorioUsuariosEnMemoriaFake,
} from './apoyo/fakes-normas-editorial';

describe('ActualizarNorma (corrección editorial)', () => {
  let repositorioUsuarios: RepositorioUsuariosEnMemoriaFake;
  let repositorioNormas: RepositorioNormasEnMemoriaFake;
  let repositorioEdiciones: RepositorioEdicionesRegistroOficialEnMemoriaFake;
  let consultorOrigen: ConsultorOrigenRegistroOficialFake;
  let casoUso: ActualizarNorma;

  beforeEach(() => {
    repositorioUsuarios = new RepositorioUsuariosEnMemoriaFake();
    repositorioNormas = new RepositorioNormasEnMemoriaFake();
    repositorioEdiciones = new RepositorioEdicionesRegistroOficialEnMemoriaFake();
    consultorOrigen = new ConsultorOrigenRegistroOficialFake();
    repositorioEdiciones.agregar(crearEdicionRegistroOficial());
    for (const rol of [
      RolUsuario.SUPERADMINISTRADOR,
      RolUsuario.EDITOR,
      RolUsuario.ADMINISTRADOR,
      RolUsuario.SUSCRIPTOR,
    ]) {
      repositorioUsuarios.agregar(crearUsuarioEditorial(rol));
    }
    casoUso = new ActualizarNorma({
      repositorioUsuarios,
      repositorioNormas,
      repositorioEdiciones,
      consultorCambiosEdicion: repositorioNormas,
      consultorOrigenRegistroOficial: consultorOrigen,
    });
  });

  it.each([RolUsuario.EDITOR, RolUsuario.SUPERADMINISTRADOR])(
    '%s completa los campos vacíos de una norma BORRADOR',
    async (rol) => {
      repositorioNormas.agregar(
        crearNormaEditorial({
          titulo: '',
          fechaExpedicion: null,
        }),
      );

      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: `usuario-${rol}`,
        normaId: 'norma-1',
        cambios: {
          titulo: 'Acuerdo Ministerial 123',
          fechaExpedicion: new Date('2026-04-30'),
        },
      });

      expect(resultado.exitoso).toBe(true);
      if (!resultado.exitoso) {
        return;
      }
      expect(resultado.norma.titulo).toBe('Acuerdo Ministerial 123');
      expect(resultado.norma.fechaExpedicion).toBe('2026-04-30');
      const persistida = await repositorioNormas.buscarPorId('norma-1');
      expect(persistida?.titulo).toBe('Acuerdo Ministerial 123');
    },
  );

  it('actualizar no publica: la norma sigue en BORRADOR', async () => {
    repositorioNormas.agregar(crearNormaEditorial());

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      normaId: 'norma-1',
      cambios: { titulo: 'Título corregido' },
    });

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) {
      return;
    }
    expect(resultado.norma.estadoEditorial).toBe(
      EstadoEditorialNorma.BORRADOR,
    );
    const persistida = await repositorioNormas.buscarPorId('norma-1');
    expect(persistida?.estaPublicada()).toBe(false);
    expect(persistida?.fechaPublicacionEnSistema).toBeNull();
  });

  it('conserva origenRegistroOficial en la respuesta de una norma nacida de ingesta', async () => {
    repositorioNormas.agregar(crearNormaEditorial());
    consultorOrigen.registrar('norma-1', {
      urlResumenMensualRegistroOficial: 'https://registroficial.gob.ec/resumen.pdf',
      segmentoCrudo: 'Segmento detectado',
    });

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      normaId: 'norma-1',
      cambios: { titulo: 'Título corregido' },
    });

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) return;
    expect(resultado.norma.origenRegistroOficial).toEqual({
      urlResumenMensualRegistroOficial: 'https://registroficial.gob.ec/resumen.pdf',
      segmentoCrudo: 'Segmento detectado',
    });
  });

  it('permite editar estadoJuridico y los datos de publicación RO', async () => {
    repositorioNormas.agregar(crearNormaEditorial());

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      normaId: 'norma-1',
      cambios: {
        estadoJuridico: EstadoNorma.REFORMADA,
        numero: '124',
        contenido: ['Texto completo de la norma'],
      },
    });

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) {
      return;
    }
    expect(resultado.norma.estadoJuridico).toBe(EstadoNorma.REFORMADA);
    expect(resultado.norma.edicionesRegistroOficial[0]).toMatchObject({
      tipoRelacion: 'PRINCIPAL',
      id: 'edicion-1',
      tipoPublicacionRegistroOficial: 'RO',
      numeroPublicacionRegistroOficial: 500,
    });
    expect(resultado.norma.numero).toBe('124');
    expect(resultado.norma.contenido).toEqual(['Texto completo de la norma']);
  });

  it('los campos no incluidos en los cambios no se tocan y fuente se proyecta desde la edición', async () => {
    repositorioNormas.agregar(crearNormaEditorial());

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      normaId: 'norma-1',
      cambios: { numero: '456' },
    });

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) {
      return;
    }
    expect(resultado.norma.numero).toBe('456');
    expect(resultado.norma.titulo).toBe('Acuerdo Ministerial 123');
    expect(resultado.norma.edicionesRegistroOficial).toEqual([
      {
        tipoRelacion: 'PRINCIPAL',
        id: 'edicion-1',
        tipoPublicacionRegistroOficial: 'RO',
        numeroPublicacionRegistroOficial: 500,
        fechaPublicacionOficial: '2026-05-02',
        fuente: 'https://www.registroficial.gob.ec/ediciones/ro-500.pdf',
      },
    ]);
    expect(resultado.norma).not.toHaveProperty('edicionRegistroOficialId');
    expect(resultado.norma).not.toHaveProperty('fuente');
  });

  it('el contrato de cambios no acepta fuente como dato propio de la norma', async () => {
    repositorioNormas.agregar(crearNormaEditorial());

    const cambiosConFuente = {
      titulo: 'Título corregido',
      fuente: 'https://url-manipulada.test/pdf',
    } as CambiosActualizarNorma & { fuente: string };

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      normaId: 'norma-1',
      cambios: cambiosConFuente,
    });

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) {
      return;
    }
    // La fuente sigue siendo la urlPdf de la edición, no el valor del body.
    expect(resultado.norma.edicionesRegistroOficial[0].fuente).toBe(
      'https://www.registroficial.gob.ec/ediciones/ro-500.pdf',
    );
    const persistida = await repositorioNormas.buscarPorId('norma-1');
    expect(persistida !== null && 'fuente' in persistida).toBe(false);
  });

  it('una norma PUBLICADA no es editable (NORMA_NO_EDITABLE)', async () => {
    repositorioNormas.agregar(
      crearNormaEditorial({
        estadoEditorial: EstadoEditorialNorma.PUBLICADA,
        fechaPublicacionEnSistema: new Date('2026-06-01'),
      }),
    );

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      normaId: 'norma-1',
      cambios: { titulo: 'No debería aplicarse' },
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'NORMA_NO_EDITABLE' });
  });

  it.each([RolUsuario.ADMINISTRADOR, RolUsuario.SUSCRIPTOR])(
    '%s no puede actualizar (ACCESO_DENEGADO)',
    async (rol) => {
      repositorioNormas.agregar(crearNormaEditorial());

      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: `usuario-${rol}`,
        normaId: 'norma-1',
        cambios: { titulo: 'Cambio prohibido' },
      });

      expect(resultado).toEqual({ exitoso: false, razon: 'ACCESO_DENEGADO' });
      const persistida = await repositorioNormas.buscarPorId('norma-1');
      expect(persistida?.titulo).toBe('Acuerdo Ministerial 123');
    },
  );

  it('norma inexistente devuelve NORMA_NO_ENCONTRADA', async () => {
    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      normaId: 'norma-fantasma',
      cambios: { titulo: 'x' },
    });

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'NORMA_NO_ENCONTRADA',
    });
  });

  it('cambios vacíos devuelven SOLICITUD_INVALIDA', async () => {
    repositorioNormas.agregar(crearNormaEditorial());

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      normaId: 'norma-1',
      cambios: {},
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
  });

  it('un contenido que no es array de textos devuelve SOLICITUD_INVALIDA sin guardar', async () => {
    repositorioNormas.agregar(crearNormaEditorial());

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      normaId: 'norma-1',
      cambios: { contenido: 'texto plano' as unknown as string[] },
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
    expect(repositorioNormas.guardadas).toHaveLength(0);
  });

  it('estadoJuridico fuera del enum devuelve SOLICITUD_INVALIDA', async () => {
    repositorioNormas.agregar(crearNormaEditorial());

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      normaId: 'norma-1',
      cambios: { estadoJuridico: 'INVENTADO' as EstadoNorma },
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
  });

  it('devuelve NORMA_NO_EDITABLE si la norma fue publicada concurrentemente tras la lectura', async () => {
    // Simula la carrera: la lectura devuelve la copia BORRADOR, pero otra
    // transacción publica la norma antes de que la corrección persista.
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
    const casoUsoConCarrera = new ActualizarNorma({
      repositorioUsuarios,
      repositorioNormas: repositorioConCarrera,
      repositorioEdiciones,
      consultorCambiosEdicion: repositorioConCarrera,
      consultorOrigenRegistroOficial: consultorOrigen,
    });

    const resultado = await casoUsoConCarrera.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      normaId: 'norma-1',
      cambios: { titulo: 'Corrección obsoleta' },
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'NORMA_NO_EDITABLE' });
    // La corrección obsoleta no revierte la publicación ni pisa datos.
    const persistida = await repositorioConCarrera.buscarPorId('norma-1');
    expect(persistida?.estaPublicada()).toBe(true);
    expect(persistida?.titulo).toBe('Acuerdo Ministerial 123');
  });

  it('devuelve la proyección de lo persistido, no la copia local del caso de uso', async () => {
    // Simula una corrección concurrente del número entre la lectura y la
    // persistencia: el resultado debe reflejar lo que quedó persistido.
    const repositorioConCorreccionConcurrente =
      new (class extends RepositorioNormasEnMemoriaFake {
        private carreraAplicada = false;

        async buscarPorId(id: string) {
          const norma = await super.buscarPorId(id);
          if (norma !== null && !this.carreraAplicada) {
            this.carreraAplicada = true;
            await super.guardar(
              norma.actualizarDatosEditoriales({ numero: '999' }),
            );
          }
          return norma;
        }
      })();
    repositorioConCorreccionConcurrente.agregar(crearNormaEditorial());
    const casoUsoConCarrera = new ActualizarNorma({
      repositorioUsuarios,
      repositorioNormas: repositorioConCorreccionConcurrente,
      repositorioEdiciones,
      consultorCambiosEdicion: repositorioConCorreccionConcurrente,
      consultorOrigenRegistroOficial: consultorOrigen,
    });

    const resultado = await casoUsoConCarrera.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      normaId: 'norma-1',
      cambios: { titulo: 'Título corregido' },
    });

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) {
      return;
    }
    expect(resultado.norma.titulo).toBe('Título corregido');
    // El número corregido concurrentemente se conserva en la proyección
    // porque proviene del estado persistido.
    const persistida = await repositorioConCorreccionConcurrente.buscarPorId(
      'norma-1',
    );
    expect(persistida?.numero).toBe(resultado.norma.numero);
  });

  it('no toca datos internos de ingesta: solo guarda la norma', async () => {
    repositorioNormas.agregar(crearNormaEditorial());

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      normaId: 'norma-1',
      cambios: { titulo: 'Título corregido' },
    });

    expect(resultado.exitoso).toBe(true);
    expect(repositorioNormas.guardadas).toHaveLength(1);
    expect(repositorioEdiciones.guardadas).toHaveLength(0);
  });
});
