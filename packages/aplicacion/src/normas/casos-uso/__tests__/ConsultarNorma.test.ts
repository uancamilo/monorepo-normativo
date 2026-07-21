import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  EstadoEditorialNorma,
  EstadoResolucionFuente,
  RolUsuario,
} from '@normativo/dominio';
import { ConsultarNorma } from '../ConsultarNorma';
import {
  ConsultorOrigenRegistroOficialFake,
  crearEdicionRegistroOficial,
  crearNormaEditorial,
  crearUsuarioEditorial,
  RepositorioEdicionesRegistroOficialEnMemoriaFake,
  RepositorioNormasEnMemoriaFake,
  RepositorioUsuariosEnMemoriaFake,
} from './apoyo/fakes-normas-editorial';

describe('ConsultarNorma (detalle editorial)', () => {
  let repositorioUsuarios: RepositorioUsuariosEnMemoriaFake;
  let repositorioNormas: RepositorioNormasEnMemoriaFake;
  let repositorioEdiciones: RepositorioEdicionesRegistroOficialEnMemoriaFake;
  let consultorOrigen: ConsultorOrigenRegistroOficialFake;
  let casoUso: ConsultarNorma;

  beforeEach(() => {
    repositorioUsuarios = new RepositorioUsuariosEnMemoriaFake();
    repositorioNormas = new RepositorioNormasEnMemoriaFake();
    repositorioEdiciones = new RepositorioEdicionesRegistroOficialEnMemoriaFake();
    consultorOrigen = new ConsultorOrigenRegistroOficialFake();
    for (const rol of [
      RolUsuario.SUPERADMINISTRADOR,
      RolUsuario.EDITOR,
      RolUsuario.ADMINISTRADOR,
      RolUsuario.SUSCRIPTOR,
    ]) {
      repositorioUsuarios.agregar(crearUsuarioEditorial(rol));
    }
    repositorioEdiciones.agregar(crearEdicionRegistroOficial());
    repositorioNormas.agregar(crearNormaEditorial({ id: 'norma-1' }));
    consultorOrigen.registrar('norma-1', {
      urlResumenMensualRegistroOficial:
        'https://www.registroficial.gob.ec/resumen-2026-05.pdf',
      segmentoCrudo: 'Texto crudo detectado por el extractor...',
    });
    repositorioNormas.agregar(
      crearNormaEditorial({
        id: 'norma-publicada',
        estadoEditorial: EstadoEditorialNorma.PUBLICADA,
        fechaPublicacionEnSistema: new Date('2026-06-01'),
      }),
    );
    consultorOrigen.registrar('norma-publicada', {
      urlResumenMensualRegistroOficial:
        'https://www.registroficial.gob.ec/resumen-2026-05.pdf',
      segmentoCrudo: 'Texto crudo de norma publicada',
    });
    repositorioNormas.agregar(
      crearNormaEditorial({ id: 'norma-manual', edicionRegistroOficialId: null }),
    );
    casoUso = new ConsultarNorma({
      repositorioUsuarios,
      repositorioNormas,
      repositorioEdiciones,
      consultorOrigenRegistroOficial: consultorOrigen,
      consultorCambiosEdicion: repositorioNormas,
    });
  });

  it.each([RolUsuario.EDITOR, RolUsuario.SUPERADMINISTRADOR])(
    '%s consulta el detalle con origenRegistroOficial cuando la norma nació de ingesta RO',
    async (rol) => {
      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: `usuario-${rol}`,
        normaId: 'norma-1',
      });

      expect(resultado.exitoso).toBe(true);
      if (!resultado.exitoso) {
        return;
      }
      expect(resultado.norma.id).toBe('norma-1');
      expect(resultado.norma.contenido).toEqual([]);
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
      expect(resultado.norma).not.toHaveProperty('fuente');
      expect(resultado.norma).not.toHaveProperty('edicionRegistroOficialId');
      expect(resultado.norma.estadoResolucionFuente).toBe('RESUELTA');
      expect(resultado.norma.origenRegistroOficial).toEqual({
        urlResumenMensualRegistroOficial:
          'https://www.registroficial.gob.ec/resumen-2026-05.pdf',
        segmentoCrudo: 'Texto crudo detectado por el extractor...',
      });
    },
  );

  it.each([RolUsuario.EDITOR, RolUsuario.SUPERADMINISTRADOR])(
    '%s conserva el origen de una PUBLICADA sin exponer estadoResolucionFuente',
    async (rol) => {
      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: `usuario-${rol}`,
        normaId: 'norma-publicada',
      });

      expect(resultado.exitoso).toBe(true);
      if (!resultado.exitoso) {
        return;
      }
      expect(resultado.norma.estadoEditorial).toBe('PUBLICADA');
      expect(resultado.norma.origenRegistroOficial).toEqual({
        urlResumenMensualRegistroOficial:
          'https://www.registroficial.gob.ec/resumen-2026-05.pdf',
        segmentoCrudo: 'Texto crudo de norma publicada',
      });
      expect(resultado.norma).not.toHaveProperty('estadoResolucionFuente');
    },
  );

  it('una norma sin origen de ingesta no incluye el bloque origenRegistroOficial', async () => {
    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      normaId: 'norma-manual',
    });

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(resultado.norma).not.toHaveProperty('origenRegistroOficial');
    }
  });

  it('una norma sin edición asociada proyecta edicionesRegistroOficial vacío', async () => {
    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      normaId: 'norma-manual',
    });

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(resultado.norma.edicionesRegistroOficial).toEqual([]);
      expect(resultado.norma).not.toHaveProperty('fuente');
      expect(resultado.norma.estadoResolucionFuente).toBeNull();
    }
  });

  it('el detalle incluye la principal y los cambios ordenados (EDITOR ve cambios pendientes)', async () => {
    repositorioEdiciones.agregar(
      crearEdicionRegistroOficial({
        id: 'edicion-cambio',
        tipoPublicacionRegistroOficial: 'SRO',
        numeroPublicacionRegistroOficial: 700,
        fechaPublicacionOficial: new Date('2027-03-10'),
        urlPdf: null,
        estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
      }),
    );
    repositorioNormas.agregarCambio('norma-1', 'edicion-cambio');

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      normaId: 'norma-1',
    });

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) return;
    expect(
      resultado.norma.edicionesRegistroOficial.map((e) => [e.tipoRelacion, e.id]),
    ).toEqual([
      ['PRINCIPAL', 'edicion-1'],
      ['CAMBIO', 'edicion-cambio'],
    ]);
    expect(resultado.norma.edicionesRegistroOficial[1].fuente).toBeNull();
  });

  it('el detalle no expone campos técnicos de ingesta', async () => {
    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      normaId: 'norma-1',
    });

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) {
      return;
    }
    for (const campoTecnico of [
      'advertencias',
      'resultadoDeteccion',
      'metadataExtraccion',
    ]) {
      expect(resultado.norma).not.toHaveProperty(campoTecnico);
    }
  });

  it.each([RolUsuario.ADMINISTRADOR, RolUsuario.SUSCRIPTOR])(
    '%s no puede consultar el detalle editorial (ACCESO_DENEGADO)',
    async (rol) => {
      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: `usuario-${rol}`,
        normaId: 'norma-1',
      });

      expect(resultado).toEqual({ exitoso: false, razon: 'ACCESO_DENEGADO' });
    },
  );

  it('norma inexistente devuelve NORMA_NO_ENCONTRADA', async () => {
    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      normaId: 'norma-fantasma',
    });

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'NORMA_NO_ENCONTRADA',
    });
  });

  it('usuario inexistente devuelve USUARIO_NO_ENCONTRADO', async () => {
    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-fantasma',
      normaId: 'norma-1',
    });

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'USUARIO_NO_ENCONTRADO',
    });
  });
});
