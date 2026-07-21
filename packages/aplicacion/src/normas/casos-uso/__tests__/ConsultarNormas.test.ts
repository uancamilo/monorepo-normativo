import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  EstadoEditorialNorma,
  EstadoResolucionFuente,
  RolUsuario,
} from '@normativo/dominio';
import { ConsultarNormas } from '../ConsultarNormas';
import {
  crearEdicionRegistroOficial,
  crearNormaEditorial,
  crearUsuarioEditorial,
  ConsultorOrigenRegistroOficialFake,
  RepositorioEdicionesRegistroOficialEnMemoriaFake,
  RepositorioNormasEnMemoriaFake,
  RepositorioUsuariosEnMemoriaFake,
} from './apoyo/fakes-normas-editorial';

describe('ConsultarNormas', () => {
  let repositorioUsuarios: RepositorioUsuariosEnMemoriaFake;
  let repositorioNormas: RepositorioNormasEnMemoriaFake;
  let repositorioEdiciones: RepositorioEdicionesRegistroOficialEnMemoriaFake;
  let consultorOrigenRegistroOficial: ConsultorOrigenRegistroOficialFake;
  let casoUso: ConsultarNormas;

  beforeEach(() => {
    repositorioUsuarios = new RepositorioUsuariosEnMemoriaFake();
    repositorioNormas = new RepositorioNormasEnMemoriaFake();
    repositorioEdiciones = new RepositorioEdicionesRegistroOficialEnMemoriaFake();
    consultorOrigenRegistroOficial = new ConsultorOrigenRegistroOficialFake();
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
    repositorioNormas.agregar(
      crearNormaEditorial({
        id: 'norma-2',
        numero: null,
        titulo: '',
        tipoNorma: '',
        institucionExpide: '',
        estadoJuridico: null,
        fechaExpedicion: null,
        edicionRegistroOficialId: null,
      }),
    );
    repositorioNormas.agregar(
      crearNormaEditorial({
        id: 'norma-3',
        estadoEditorial: EstadoEditorialNorma.PUBLICADA,
        fechaPublicacionEnSistema: new Date('2026-06-01'),
      }),
    );
    consultorOrigenRegistroOficial.registrar('norma-1', {
      urlResumenMensualRegistroOficial:
        'https://www.registroficial.gob.ec/resumen-2026-05.pdf',
      segmentoCrudo: 'Acuerdo Ministerial 123 detectado en el resumen',
    });
    consultorOrigenRegistroOficial.registrar('norma-3', {
      urlResumenMensualRegistroOficial:
        'https://www.registroficial.gob.ec/resumen-2026-06.pdf',
      segmentoCrudo: 'Norma publicada detectada en el resumen',
    });
    casoUso = new ConsultarNormas({
      repositorioUsuarios,
      repositorioNormas,
      repositorioEdiciones,
      consultorOrigenRegistroOficial,
      consultorCambiosEdicion: repositorioNormas,
    });
  });

  it.each([RolUsuario.EDITOR, RolUsuario.SUPERADMINISTRADOR])(
    '%s consulta las normas BORRADOR como lista editorial estándar',
    async (rol) => {
      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: `usuario-${rol}`,
        estadoEditorial: 'BORRADOR',
      });

      expect(resultado.exitoso).toBe(true);
      if (!resultado.exitoso) {
        return;
      }
      expect(resultado.normas).toHaveLength(2);
      expect(resultado.normas.map((norma) => norma.id)).toEqual([
        'norma-1',
        'norma-2',
      ]);
      // La trazabilidad al Registro Oficial sale de `edicionesRegistroOficial`.
      expect(resultado.normas[0]).toEqual({
        id: 'norma-1',
        estadoEditorial: 'BORRADOR',
        estadoJuridico: 'VIGENTE',
        tipoNorma: 'Acuerdo Ministerial',
        numero: '123',
        titulo: 'Acuerdo Ministerial 123',
        institucionExpide: 'Ministerio de Salud Pública',
        fechaExpedicion: null,
        edicionesRegistroOficial: [
          {
            tipoRelacion: 'PRINCIPAL',
            id: 'edicion-1',
            tipoPublicacionRegistroOficial: 'RO',
            numeroPublicacionRegistroOficial: 500,
            fechaPublicacionOficial: '2026-05-02',
            fuente: 'https://www.registroficial.gob.ec/ediciones/ro-500.pdf',
          },
        ],
        estadoResolucionFuente: 'RESUELTA',
        origenRegistroOficial: {
          urlResumenMensualRegistroOficial:
            'https://www.registroficial.gob.ec/resumen-2026-05.pdf',
          segmentoCrudo: 'Acuerdo Ministerial 123 detectado en el resumen',
        },
      });
      // Nunca campos singulares de edición en la respuesta.
      for (const singular of [
        'fuente',
        'edicionRegistroOficialId',
        'fechaPublicacionOficial',
        'tipoPublicacionRegistroOficial',
        'numeroPublicacionRegistroOficial',
      ]) {
        expect(resultado.normas[0]).not.toHaveProperty(singular);
      }
    },
  );

  it('los campos no detectados se serializan vacíos o nulos, sin placeholders', async () => {
    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      estadoEditorial: 'BORRADOR',
    });

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) {
      return;
    }
    expect(resultado.normas[1]).toEqual({
      id: 'norma-2',
      estadoEditorial: 'BORRADOR',
      estadoJuridico: null,
      tipoNorma: '',
      numero: '',
      titulo: '',
      institucionExpide: '',
      fechaExpedicion: null,
      edicionesRegistroOficial: [],
      estadoResolucionFuente: null,
    });
    expect(resultado.normas[1]).not.toHaveProperty('origenRegistroOficial');
  });

  it('la corrección de fuente de la edición queda visible en todas sus normas', async () => {
    const edicionCorregida = crearEdicionRegistroOficial().corregirFuenteManualmente(
      'https://www.registroficial.gob.ec/ediciones/ro-500-corregida.pdf',
    );
    await repositorioEdiciones.guardar(edicionCorregida);
    repositorioNormas.agregar(
      crearNormaEditorial({ id: 'norma-hermana', numero: '999' }),
    );

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      estadoEditorial: 'BORRADOR',
    });

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) {
      return;
    }
    const normasDeLaEdicion = resultado.normas.filter((norma) =>
      norma.edicionesRegistroOficial.some(
        (edicion) =>
          edicion.tipoRelacion === 'PRINCIPAL' && edicion.id === 'edicion-1',
      ),
    );
    expect(normasDeLaEdicion).toHaveLength(2);
    for (const norma of normasDeLaEdicion) {
      expect(norma.edicionesRegistroOficial[0].fuente).toBe(
        'https://www.registroficial.gob.ec/ediciones/ro-500-corregida.pdf',
      );
      expect(norma.estadoResolucionFuente).toBe('MANUAL');
    }
  });

  it('proyecta la principal primero y los cambios ordenados; los cambios pendientes son visibles al editor', async () => {
    repositorioEdiciones.agregar(
      crearEdicionRegistroOficial({
        id: 'edicion-cambio-tardio',
        tipoPublicacionRegistroOficial: 'SRO',
        numeroPublicacionRegistroOficial: 700,
        fechaPublicacionOficial: new Date('2027-03-10'),
        urlPdf: null,
        estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
      }),
    );
    repositorioEdiciones.agregar(
      crearEdicionRegistroOficial({
        id: 'edicion-cambio-temprano',
        tipoPublicacionRegistroOficial: 'SRO',
        numeroPublicacionRegistroOficial: 600,
        fechaPublicacionOficial: new Date('2026-06-01'),
        urlPdf: null,
        estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
      }),
    );
    repositorioNormas.agregarCambio('norma-1', 'edicion-cambio-tardio');
    repositorioNormas.agregarCambio('norma-1', 'edicion-cambio-temprano');

    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      estadoEditorial: 'BORRADOR',
    });

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) {
      return;
    }
    const norma1 = resultado.normas.find((n) => n.id === 'norma-1');
    expect(norma1?.edicionesRegistroOficial.map((e) => [e.tipoRelacion, e.id])).toEqual([
      ['PRINCIPAL', 'edicion-1'],
      ['CAMBIO', 'edicion-cambio-temprano'],
      ['CAMBIO', 'edicion-cambio-tardio'],
    ]);
    // El cambio pendiente sin URL sí es visible en la vista editorial.
    expect(norma1?.edicionesRegistroOficial[1].fuente).toBeNull();
  });

  it('la lista incluye el origen editorial mínimo pero no señales técnicas de ingesta', async () => {
    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      estadoEditorial: 'BORRADOR',
    });

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) {
      return;
    }
    expect(Array.isArray(resultado.normas)).toBe(true);
    for (const norma of resultado.normas) {
      for (const campoTecnico of [
        'advertencias',
        'resultadoDeteccion',
        'metadataExtraccion',
        'total',
        'loteId',
        'contenido',
      ]) {
        expect(norma).not.toHaveProperty(campoTecnico);
      }
    }
    expect(resultado.normas[0].origenRegistroOficial).toEqual({
      urlResumenMensualRegistroOficial:
        'https://www.registroficial.gob.ec/resumen-2026-05.pdf',
      segmentoCrudo: 'Acuerdo Ministerial 123 detectado en el resumen',
    });
    expect(consultorOrigenRegistroOficial.consultasMasivas).toEqual([
      ['norma-1', 'norma-2'],
    ]);
  });

  it('el filtro BORRADOR excluye las normas PUBLICADA y viceversa', async () => {
    const borradores = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      estadoEditorial: 'BORRADOR',
    });
    const publicadas = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      estadoEditorial: 'PUBLICADA',
    });

    expect(borradores.exitoso && publicadas.exitoso).toBe(true);
    if (!borradores.exitoso || !publicadas.exitoso) {
      return;
    }
    expect(
      borradores.normas.every((norma) => norma.estadoEditorial === 'BORRADOR'),
    ).toBe(true);
    expect(publicadas.normas.map((norma) => norma.id)).toEqual(['norma-3']);
    expect(publicadas.normas[0].origenRegistroOficial).toEqual({
      urlResumenMensualRegistroOficial:
        'https://www.registroficial.gob.ec/resumen-2026-06.pdf',
      segmentoCrudo: 'Norma publicada detectada en el resumen',
    });
    expect(publicadas.normas[0]).not.toHaveProperty(
      'estadoResolucionFuente',
    );
  });

  it('sin filtro devuelve todas las normas', async () => {
    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
    });

    expect(resultado.exitoso).toBe(true);
    if (resultado.exitoso) {
      expect(resultado.normas).toHaveLength(3);
    }
  });

  it('estadoEditorial inválido devuelve SOLICITUD_INVALIDA', async () => {
    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-EDITOR',
      estadoEditorial: 'INEXISTENTE',
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
  });

  it.each([RolUsuario.ADMINISTRADOR, RolUsuario.SUSCRIPTOR])(
    '%s no puede consultar la lista editorial (ACCESO_DENEGADO)',
    async (rol) => {
      const resultado = await casoUso.ejecutar({
        usuarioAutenticadoId: `usuario-${rol}`,
        estadoEditorial: 'BORRADOR',
      });

      expect(resultado).toEqual({ exitoso: false, razon: 'ACCESO_DENEGADO' });
    },
  );

  it('usuario inexistente devuelve USUARIO_NO_ENCONTRADO', async () => {
    const resultado = await casoUso.ejecutar({
      usuarioAutenticadoId: 'usuario-fantasma',
      estadoEditorial: 'BORRADOR',
    });

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'USUARIO_NO_ENCONTRADO',
    });
  });
});
