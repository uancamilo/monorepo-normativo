import { describe, expect, it } from '@jest/globals';
import {
  EdicionRegistroOficial,
  EstadoEditorialNorma,
  EstadoNorma,
  EstadoResolucionFuente,
  Norma,
} from '@normativo/dominio';
import {
  EventoNormaPublicada,
  PublicadorEventosNormas,
} from '@normativo/aplicacion';
import { RepositorioNormasEnMemoria } from '../RepositorioNormasEnMemoria';
import { RepositorioEdicionesRegistroOficialEnMemoria } from '../RepositorioEdicionesRegistroOficialEnMemoria';
import { UnidadDeTrabajoPublicacionNormaEnMemoria } from '../UnidadDeTrabajoPublicacionNormaEnMemoria';
import { PublicadorEventosNormasEnMemoria } from '../PublicadorEventosNormasEnMemoria';

const FECHA_PUBLICACION = new Date('2026-06-01T12:00:00.000Z');

/** Falla antes de registrar el evento: nunca queda rastro del evento fallido. */
class PublicadorEventosFallido implements PublicadorEventosNormas {
  readonly error = new Error('Fallo al emitir el evento de publicación');
  readonly eventos: EventoNormaPublicada[] = [];

  async publicarNormaPublicada(): Promise<never> {
    throw this.error;
  }
}

function crearEdicionPublicable(id = 'edicion-1'): EdicionRegistroOficial {
  return new EdicionRegistroOficial({
    id,
    tipoPublicacionRegistroOficial: 'RO',
    numeroPublicacionRegistroOficial: 500,
    fechaPublicacionOficial: new Date('2026-05-02T00:00:00.000Z'),
    urlPdf: 'https://www.registroficial.gob.ec/ediciones/ro-500.pdf',
    estadoResolucionFuente: EstadoResolucionFuente.MANUAL,
  });
}

function crearEdicionPendiente(id = 'edicion-pendiente'): EdicionRegistroOficial {
  return new EdicionRegistroOficial({
    id,
    tipoPublicacionRegistroOficial: 'SRO',
    numeroPublicacionRegistroOficial: 600,
    fechaPublicacionOficial: new Date('2026-05-03T00:00:00.000Z'),
    urlPdf: null,
    estadoResolucionFuente: EstadoResolucionFuente.PENDIENTE,
  });
}

interface ContextoUnidadEnMemoria {
  repositorio: RepositorioNormasEnMemoria;
  repositorioEdiciones: RepositorioEdicionesRegistroOficialEnMemoria;
  publicador: PublicadorEventosNormasEnMemoria;
  unidad: UnidadDeTrabajoPublicacionNormaEnMemoria;
}

async function crearContextoUnidad(): Promise<ContextoUnidadEnMemoria> {
  const repositorio = new RepositorioNormasEnMemoria();
  const repositorioEdiciones = new RepositorioEdicionesRegistroOficialEnMemoria();
  const publicador = new PublicadorEventosNormasEnMemoria();
  await repositorioEdiciones.guardar(crearEdicionPublicable());
  const unidad = new UnidadDeTrabajoPublicacionNormaEnMemoria(
    repositorio,
    repositorioEdiciones,
    publicador,
  );
  return { repositorio, repositorioEdiciones, publicador, unidad };
}

function crearNormaBorrador(
  id = 'norma-1',
  edicionRegistroOficialId: string | null = 'edicion-1',
): Norma {
  return new Norma({
    id,
    numero: '123',
    titulo: 'Acuerdo Ministerial 123',
    contenido: [],
    tipoNorma: 'Acuerdo Ministerial',
    institucionExpide: 'Ministerio de Salud Pública',
    estadoJuridico: EstadoNorma.VIGENTE,
    estadoEditorial: EstadoEditorialNorma.BORRADOR,
    fechaExpedicion: null,
    edicionRegistroOficialId,
    fechaPublicacionEnSistema: null,
  });
}

function crearNormaEnRevision(id = 'norma-1'): Norma {
  return new Norma({
    id,
    numero: '123',
    titulo: 'Acuerdo Ministerial 123',
    contenido: [],
    tipoNorma: 'Acuerdo Ministerial',
    institucionExpide: 'Ministerio de Salud Pública',
    estadoJuridico: EstadoNorma.VIGENTE,
    estadoEditorial: EstadoEditorialNorma.EN_REVISION,
    fechaExpedicion: null,
    edicionRegistroOficialId: 'edicion-1',
    fechaPublicacionEnSistema: null,
  });
}

describe('RepositorioEdicionesRegistroOficialEnMemoria — fecha calendario', () => {
  it('busca la misma triple por día aunque la clave directa contenga hora', async () => {
    const repositorio = new RepositorioEdicionesRegistroOficialEnMemoria();
    const edicion = crearEdicionPublicable();
    await repositorio.guardar(edicion);

    const encontrada = await repositorio.buscarPorClave({
      tipoPublicacionRegistroOficial: edicion.tipoPublicacionRegistroOficial,
      numeroPublicacionRegistroOficial:
        edicion.numeroPublicacionRegistroOficial,
      fechaPublicacionOficial: new Date('2026-05-02T23:59:59.999Z'),
    });

    expect(encontrada?.id).toBe(edicion.id);
  });
});

describe('RepositorioNormasEnMemoria — escrituras condicionadas', () => {
  it('actualizarBorrador no revierte una norma ya publicada (NORMA_NO_EDITABLE)', async () => {
    const repositorio = new RepositorioNormasEnMemoria();
    const borrador = crearNormaBorrador();
    await repositorio.guardar(borrador);
    // Otra transacción publica antes de que llegue la corrección obsoleta.
    await repositorio.guardar(borrador.publicar(FECHA_PUBLICACION));

    const resultado = await repositorio.actualizarBorrador(
      borrador.actualizarDatosEditoriales({ titulo: 'Corrección obsoleta' }),
    );

    expect(resultado).toEqual({
      actualizada: false,
      razon: 'NORMA_NO_EDITABLE',
    });
    const persistida = await repositorio.buscarPorId('norma-1');
    expect(persistida?.estaPublicada()).toBe(true);
    expect(persistida?.titulo).toBe('Acuerdo Ministerial 123');
    expect(persistida?.fechaPublicacionEnSistema).toEqual(FECHA_PUBLICACION);
  });

  it('actualizarBorrador devuelve NORMA_NO_ENCONTRADA si la norma no existe', async () => {
    const repositorio = new RepositorioNormasEnMemoria();

    const resultado = await repositorio.actualizarBorrador(crearNormaBorrador());

    expect(resultado).toEqual({
      actualizada: false,
      razon: 'NORMA_NO_ENCONTRADA',
    });
  });

  it('actualizarBorrador persiste solo datos editoriales y devuelve lo persistido', async () => {
    const repositorio = new RepositorioNormasEnMemoria();
    const borrador = crearNormaBorrador();
    await repositorio.guardar(borrador);

    const resultado = await repositorio.actualizarBorrador(
      borrador.actualizarDatosEditoriales({
        titulo: 'Título corregido',
        numero: '456',
      }),
    );

    expect(resultado.actualizada).toBe(true);
    if (!resultado.actualizada) {
      return;
    }
    expect(resultado.norma.titulo).toBe('Título corregido');
    expect(resultado.norma.numero).toBe('456');
    expect(resultado.norma.estadoEditorial).toBe(
      EstadoEditorialNorma.BORRADOR,
    );
    const persistida = await repositorio.buscarPorId('norma-1');
    expect(persistida?.titulo).toBe('Título corregido');
  });

  it('reemplazarEdicionPrincipalSiEstado conserva la principal anterior como cambio', async () => {
    const repositorio = new RepositorioNormasEnMemoria();
    const borrador = crearNormaBorrador();
    await repositorio.guardar(borrador);

    const resultado = await repositorio.reemplazarEdicionPrincipalSiEstado(
      'norma-1',
      'edicion-2',
      EstadoEditorialNorma.BORRADOR,
    );

    expect(resultado.actualizada).toBe(true);
    const persistida = await repositorio.buscarPorId('norma-1');
    expect(persistida?.edicionRegistroOficialId).toBe('edicion-2');
    expect(persistida?.titulo).toBe(borrador.titulo);
    expect(persistida?.numero).toBe(borrador.numero);
    expect(persistida?.contenido).toEqual(borrador.contenido);
    expect(persistida?.estadoJuridico).toBe(borrador.estadoJuridico);
    expect(persistida?.estadoEditorial).toBe(borrador.estadoEditorial);
    expect(await repositorio.buscarCambiosPorNormaId('norma-1')).toEqual([
      'edicion-1',
    ]);
  });

  it('reemplazarEdicionPrincipalSiEstado no aplica si el estado editorial cambió concurrentemente', async () => {
    const repositorio = new RepositorioNormasEnMemoria();
    const borrador = crearNormaBorrador();
    await repositorio.guardar(borrador);
    await repositorio.guardar(borrador.publicar(FECHA_PUBLICACION));

    const resultado = await repositorio.reemplazarEdicionPrincipalSiEstado(
      'norma-1',
      'edicion-2',
      EstadoEditorialNorma.BORRADOR,
    );

    expect(resultado).toEqual({
      actualizada: false,
      razon: 'ESTADO_EDITORIAL_CAMBIO_CONCURRENTE',
    });
    const persistida = await repositorio.buscarPorId('norma-1');
    expect(persistida?.edicionRegistroOficialId).toBe('edicion-1');
  });

  it('reemplazarEdicionPrincipalSiEstado devuelve NORMA_NO_ENCONTRADA si la norma no existe', async () => {
    const repositorio = new RepositorioNormasEnMemoria();

    const resultado = await repositorio.reemplazarEdicionPrincipalSiEstado(
      'norma-fantasma',
      'edicion-2',
      EstadoEditorialNorma.BORRADOR,
    );

    expect(resultado).toEqual({
      actualizada: false,
      razon: 'NORMA_NO_ENCONTRADA',
    });
  });

  it('asigna la primera principal sin crear una edición de cambio', async () => {
    const repositorio = new RepositorioNormasEnMemoria();
    await repositorio.guardar(crearNormaBorrador('norma-sin-principal', null));

    const resultado = await repositorio.reemplazarEdicionPrincipalSiEstado(
      'norma-sin-principal',
      'edicion-2',
      EstadoEditorialNorma.BORRADOR,
    );

    expect(resultado.actualizada).toBe(true);
    expect(await repositorio.buscarCambiosPorNormaId('norma-sin-principal')).toEqual(
      [],
    );
  });

  it('es idempotente y nunca duplica ni conserva la principal como cambio', async () => {
    const repositorio = new RepositorioNormasEnMemoria();
    await repositorio.guardar(crearNormaBorrador());

    await repositorio.reemplazarEdicionPrincipalSiEstado(
      'norma-1',
      'edicion-2',
      EstadoEditorialNorma.BORRADOR,
    );
    const repetida = await repositorio.reemplazarEdicionPrincipalSiEstado(
      'norma-1',
      'edicion-2',
      EstadoEditorialNorma.BORRADOR,
    );

    expect(repetida.actualizada).toBe(true);
    if (!repetida.actualizada) return;
    expect(repetida.edicionesCambioIds).toEqual(['edicion-1']);
    expect(await repositorio.buscarCambiosPorNormaId('norma-1')).toEqual([
      'edicion-1',
    ]);
  });

  it('conserva varias principales anteriores y permite consultarlas en bloque', async () => {
    const repositorio = new RepositorioNormasEnMemoria();
    await repositorio.guardar(crearNormaBorrador('norma-1'));
    await repositorio.guardar(crearNormaBorrador('norma-2'));

    await repositorio.reemplazarEdicionPrincipalSiEstado(
      'norma-1',
      'edicion-2',
      EstadoEditorialNorma.BORRADOR,
    );
    await repositorio.reemplazarEdicionPrincipalSiEstado(
      'norma-1',
      'edicion-3',
      EstadoEditorialNorma.BORRADOR,
    );
    await repositorio.reemplazarEdicionPrincipalSiEstado(
      'norma-2',
      'edicion-2',
      EstadoEditorialNorma.BORRADOR,
    );

    const cambios = await repositorio.buscarCambiosPorNormaIds([
      'norma-1',
      'norma-2',
      'norma-sin-cambios',
    ]);
    expect(cambios).toEqual(
      new Map([
        ['norma-1', ['edicion-1', 'edicion-2']],
        ['norma-2', ['edicion-1']],
        ['norma-sin-cambios', []],
      ]),
    );
  });
});

describe('UnidadDeTrabajoPublicacionNormaEnMemoria — publicación condicionada', () => {
  it('publica sobre el estado actual: no sobrescribe una corrección editorial previa y emite un evento', async () => {
    const { repositorio, publicador, unidad } = await crearContextoUnidad();
    const copiaLeida = crearNormaBorrador();
    await repositorio.guardar(copiaLeida);
    // Corrección concurrente válida después de que la publicación leyó su copia.
    await repositorio.guardar(
      copiaLeida.actualizarDatosEditoriales({ titulo: 'Título corregido' }),
    );

    const resultado = await unidad.guardarNormaPublicadaConEvento(
      copiaLeida.publicar(FECHA_PUBLICACION),
      {
        normaId: copiaLeida.id,
        fechaPublicacionEnSistema: FECHA_PUBLICACION,
        tieneContenidoCompleto: false,
      },
    );

    expect(resultado).toEqual({
      publicada: true,
      tieneContenidoCompleto: false,
    });
    const persistida = await repositorio.buscarPorId('norma-1');
    expect(persistida?.estaPublicada()).toBe(true);
    expect(persistida?.fechaPublicacionEnSistema).toEqual(FECHA_PUBLICACION);
    // La corrección previa se conserva: publicar solo cambia estado y fecha.
    expect(persistida?.titulo).toBe('Título corregido');
    expect(publicador.eventos).toHaveLength(1);
  });

  it('el evento refleja el contenido persistido vigente, no la copia leída', async () => {
    const { repositorio, publicador, unidad } = await crearContextoUnidad();
    const copiaLeida = crearNormaBorrador();
    await repositorio.guardar(copiaLeida);
    // El contenido pasa de vacío a completo después de la lectura.
    await repositorio.guardar(
      copiaLeida.actualizarDatosEditoriales({ contenido: ['Texto completo'] }),
    );

    const resultado = await unidad.guardarNormaPublicadaConEvento(
      copiaLeida.publicar(FECHA_PUBLICACION),
      {
        normaId: copiaLeida.id,
        fechaPublicacionEnSistema: FECHA_PUBLICACION,
        // Calculado sobre la copia obsoleta: la unidad debe recalcularlo.
        tieneContenidoCompleto: false,
      },
    );

    expect(resultado).toEqual({
      publicada: true,
      tieneContenidoCompleto: true,
    });
    expect(publicador.eventos).toHaveLength(1);
    expect(publicador.eventos[0].tieneContenidoCompleto).toBe(true);
  });

  it('una corrección concurrente que limpia el título produce NORMA_MODIFICADA_CONCURRENTEMENTE sin evento', async () => {
    const { repositorio, publicador, unidad } = await crearContextoUnidad();
    const copiaLeida = crearNormaBorrador();
    await repositorio.guardar(copiaLeida);
    // La corrección concurrente deja la norma sin título (válido en BORRADOR).
    await repositorio.guardar(
      copiaLeida.actualizarDatosEditoriales({ titulo: '' }),
    );

    const resultado = await unidad.guardarNormaPublicadaConEvento(
      copiaLeida.publicar(FECHA_PUBLICACION),
      {
        normaId: copiaLeida.id,
        fechaPublicacionEnSistema: FECHA_PUBLICACION,
        tieneContenidoCompleto: false,
      },
    );

    expect(resultado).toEqual({
      publicada: false,
      razon: 'NORMA_MODIFICADA_CONCURRENTEMENTE',
    });
    const persistida = await repositorio.buscarPorId('norma-1');
    expect(persistida?.estaPublicada()).toBe(false);
    expect(persistida?.titulo).toBe('');
    expect(persistida?.fechaPublicacionEnSistema).toBeNull();
    expect(publicador.eventos).toHaveLength(0);
  });

  it('una norma que pasó a EN_REVISION concurrentemente produce NORMA_MODIFICADA_CONCURRENTEMENTE sin evento (paridad Prisma: solo publica desde BORRADOR)', async () => {
    const { repositorio, publicador, unidad } = await crearContextoUnidad();
    const copiaLeida = crearNormaBorrador();
    await repositorio.guardar(copiaLeida);
    // Otra transacción mueve la norma a EN_REVISION antes de la publicación obsoleta.
    await repositorio.guardar(crearNormaEnRevision());

    const resultado = await unidad.guardarNormaPublicadaConEvento(
      copiaLeida.publicar(FECHA_PUBLICACION),
      {
        normaId: copiaLeida.id,
        fechaPublicacionEnSistema: FECHA_PUBLICACION,
        tieneContenidoCompleto: false,
      },
    );

    expect(resultado).toEqual({
      publicada: false,
      razon: 'NORMA_MODIFICADA_CONCURRENTEMENTE',
    });
    const persistida = await repositorio.buscarPorId('norma-1');
    expect(persistida?.estadoEditorial).toBe(EstadoEditorialNorma.EN_REVISION);
    expect(persistida?.fechaPublicacionEnSistema).toBeNull();
    expect(publicador.eventos).toHaveLength(0);
  });

  it('un cambio concurrente a una edición PENDIENTE produce NORMA_MODIFICADA_CONCURRENTEMENTE sin evento', async () => {
    const { repositorio, repositorioEdiciones, publicador, unidad } =
      await crearContextoUnidad();
    await repositorioEdiciones.guardar(crearEdicionPendiente());
    const copiaLeida = crearNormaBorrador();
    await repositorio.guardar(copiaLeida);
    // La norma queda asociada a una edición sin fuente publicable.
    await repositorio.reemplazarEdicionPrincipalSiEstado(
      copiaLeida.id,
      'edicion-pendiente',
      EstadoEditorialNorma.BORRADOR,
    );

    const resultado = await unidad.guardarNormaPublicadaConEvento(
      copiaLeida.publicar(FECHA_PUBLICACION),
      {
        normaId: copiaLeida.id,
        fechaPublicacionEnSistema: FECHA_PUBLICACION,
        tieneContenidoCompleto: false,
      },
    );

    expect(resultado).toEqual({
      publicada: false,
      razon: 'NORMA_MODIFICADA_CONCURRENTEMENTE',
    });
    const persistida = await repositorio.buscarPorId('norma-1');
    expect(persistida?.estaPublicada()).toBe(false);
    expect(persistida?.edicionRegistroOficialId).toBe('edicion-pendiente');
    expect(persistida?.fechaPublicacionEnSistema).toBeNull();
    expect(publicador.eventos).toHaveLength(0);
  });

  it('un cambio concurrente a otra edición publicable permite publicar conservando la edición nueva', async () => {
    const { repositorio, repositorioEdiciones, publicador, unidad } =
      await crearContextoUnidad();
    await repositorioEdiciones.guardar(
      new EdicionRegistroOficial({
        id: 'edicion-2',
        tipoPublicacionRegistroOficial: 'SRO',
        numeroPublicacionRegistroOficial: 700,
        fechaPublicacionOficial: new Date('2026-05-05T00:00:00.000Z'),
        urlPdf: 'https://www.registroficial.gob.ec/ediciones/sro-700.pdf',
        estadoResolucionFuente: EstadoResolucionFuente.RESUELTA,
      }),
    );
    const copiaLeida = crearNormaBorrador();
    await repositorio.guardar(copiaLeida);
    await repositorio.reemplazarEdicionPrincipalSiEstado(
      copiaLeida.id,
      'edicion-2',
      EstadoEditorialNorma.BORRADOR,
    );

    const resultado = await unidad.guardarNormaPublicadaConEvento(
      copiaLeida.publicar(FECHA_PUBLICACION),
      {
        normaId: copiaLeida.id,
        fechaPublicacionEnSistema: FECHA_PUBLICACION,
        tieneContenidoCompleto: false,
      },
    );

    expect(resultado).toEqual({
      publicada: true,
      tieneContenidoCompleto: false,
    });
    const persistida = await repositorio.buscarPorId('norma-1');
    expect(persistida?.estaPublicada()).toBe(true);
    expect(persistida?.edicionRegistroOficialId).toBe('edicion-2');
    expect(publicador.eventos).toHaveLength(1);
  });

  it('si el publicador de eventos falla, restaura la norma a BORRADOR y propaga el error', async () => {
    const repositorio = new RepositorioNormasEnMemoria();
    const repositorioEdiciones =
      new RepositorioEdicionesRegistroOficialEnMemoria();
    await repositorioEdiciones.guardar(crearEdicionPublicable());
    // El publicador lanza antes de registrar el evento: cero eventos siempre.
    const publicadorFallido = new PublicadorEventosFallido();
    const unidad = new UnidadDeTrabajoPublicacionNormaEnMemoria(
      repositorio,
      repositorioEdiciones,
      publicadorFallido,
    );
    const borrador = crearNormaBorrador();
    await repositorio.guardar(borrador);

    await expect(
      unidad.guardarNormaPublicadaConEvento(borrador.publicar(FECHA_PUBLICACION), {
        normaId: borrador.id,
        fechaPublicacionEnSistema: FECHA_PUBLICACION,
        tieneContenidoCompleto: false,
      }),
    ).rejects.toBe(publicadorFallido.error);

    const persistida = await repositorio.buscarPorId('norma-1');
    expect(persistida?.estadoEditorial).toBe(EstadoEditorialNorma.BORRADOR);
    expect(persistida?.fechaPublicacionEnSistema).toBeNull();
    expect(publicadorFallido.eventos).toHaveLength(0);
  });

  it('una doble publicación produce un éxito, un NORMA_YA_PUBLICADA y un solo evento', async () => {
    const { repositorio, publicador, unidad } = await crearContextoUnidad();
    const borrador = crearNormaBorrador();
    await repositorio.guardar(borrador);
    const evento = {
      normaId: borrador.id,
      fechaPublicacionEnSistema: FECHA_PUBLICACION,
      tieneContenidoCompleto: false,
    };

    const primero = await unidad.guardarNormaPublicadaConEvento(
      borrador.publicar(FECHA_PUBLICACION),
      evento,
    );
    const segundo = await unidad.guardarNormaPublicadaConEvento(
      borrador.publicar(FECHA_PUBLICACION),
      evento,
    );

    expect(primero).toEqual({
      publicada: true,
      tieneContenidoCompleto: false,
    });
    expect(segundo).toEqual({
      publicada: false,
      razon: 'NORMA_YA_PUBLICADA',
    });
    expect(publicador.eventos).toHaveLength(1);
    const persistida = await repositorio.buscarPorId('norma-1');
    expect(persistida?.estaPublicada()).toBe(true);
  });

  it('no publica ni emite evento si la norma no existe', async () => {
    const { publicador, unidad } = await crearContextoUnidad();
    const normaNuncaGuardada = crearNormaBorrador('norma-nunca-guardada');

    const resultado = await unidad.guardarNormaPublicadaConEvento(
      normaNuncaGuardada.publicar(FECHA_PUBLICACION),
      {
        normaId: normaNuncaGuardada.id,
        fechaPublicacionEnSistema: FECHA_PUBLICACION,
        tieneContenidoCompleto: false,
      },
    );

    expect(resultado).toEqual({
      publicada: false,
      razon: 'NORMA_YA_PUBLICADA',
    });
    expect(publicador.eventos).toHaveLength(0);
  });
});
