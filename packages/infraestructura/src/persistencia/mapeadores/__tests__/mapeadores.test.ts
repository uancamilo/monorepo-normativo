import { describe, expect, it } from '@jest/globals';
import {
  EstadoEditorialNorma,
  EstadoNorma,
  EstadoResolucionFuente,
  EstadoSuscripcion,
  RolUsuario,
} from '@normativo/dominio';
import {
  mapearDatosEditorialesNormaPrisma,
  mapearNormaDesdePrisma,
} from '../mapearNorma';
import { mapearEdicionRegistroOficialDesdePrisma } from '../mapearEdicionRegistroOficial';
import { mapearUsuarioDesdePrisma } from '../mapearUsuario';
import { mapearSuscripcionDesdePrisma } from '../mapearSuscripcion';

function filaNorma(overrides: Record<string, unknown> = {}) {
  return {
    id: 'norma-1',
    numero: null,
    titulo: 'Norma de prueba',
    contenido: [],
    tipoNorma: 'Ley',
    institucionExpide: 'Asamblea Nacional',
    estadoJuridico: 'VIGENTE',
    estadoEditorial: 'BORRADOR',
    fechaExpedicion: new Date('2025-01-01T00:00:00.000Z'),
    fechaPublicacionOficial: new Date('2025-01-02T00:00:00.000Z'),
    tipoPublicacionRegistroOficial: 'RO',
    numeroPublicacionRegistroOficial: 500,
    edicionRegistroOficialId: 'edicion-1',
    fechaPublicacionEnSistema: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function filaEdicion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'edicion-1',
    tipoPublicacionRegistroOficial: 'RO',
    numeroPublicacionRegistroOficial: 500,
    fechaPublicacionOficial: new Date('2025-01-02T00:00:00.000Z'),
    urlPdf: 'https://www.registroficial.gob.ec/ediciones/ro-500.pdf',
    estadoResolucionFuente: 'RESUELTA',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function filaUsuario(overrides: Record<string, unknown> = {}) {
  return {
    id: 'usuario-1',
    nombre: 'Usuario',
    apellido: 'Prueba',
    correoNormalizado: 'usuario@test.com',
    rol: 'EDITOR',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function filaSuscripcion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'suscripcion-1',
    clienteId: 'cliente-1',
    cantidadMaximaUsuarios: 1,
    estado: 'ACTIVA',
    fechaInicio: new Date('2025-01-01T00:00:00.000Z'),
    fechaFin: new Date('2026-01-01T00:00:00.000Z'),
    correosHabilitados: [{ correoNormalizado: 'suscriptor@test.com' }],
    ...overrides,
  };
}

describe('mapeadores desde Prisma (validación runtime de enums)', () => {
  it('mapearNormaDesdePrisma reconstruye enums válidos', () => {
    const norma = mapearNormaDesdePrisma(filaNorma() as never);

    expect(norma.estadoJuridico).toBe(EstadoNorma.VIGENTE);
    expect(norma.estadoEditorial).toBe(EstadoEditorialNorma.BORRADOR);
  });

  it('mapearNormaDesdePrisma acepta campos anulables de un borrador incompleto', () => {
    const norma = mapearNormaDesdePrisma(
      filaNorma({
        titulo: '',
        tipoNorma: '',
        institucionExpide: '',
        estadoJuridico: null,
        fechaExpedicion: null,
        fechaPublicacionOficial: null,
        tipoPublicacionRegistroOficial: '',
        numeroPublicacionRegistroOficial: null,
        edicionRegistroOficialId: null,
      }) as never,
    );

    expect(norma.titulo).toBe('');
    expect(norma.estadoJuridico).toBeNull();
    expect(norma.fechaExpedicion).toBeNull();
    expect(norma.edicionRegistroOficialId).toBeNull();
  });

  it('mapearNormaDesdePrisma no reconstruye fuente ni fecha cruda como datos propios', () => {
    const norma = mapearNormaDesdePrisma(filaNorma() as never);

    expect('fuente' in norma).toBe(false);
    expect('fechaPublicacionRegistroOficialCruda' in norma).toBe(false);
    expect(norma.edicionRegistroOficialId).toBe('edicion-1');
    expect(norma.contenido).toEqual([]);
  });

  it('mapearDatosEditorialesNormaPrisma excluye estado editorial, edición y fecha de publicación', () => {
    const norma = mapearNormaDesdePrisma(filaNorma() as never);

    const datos = mapearDatosEditorialesNormaPrisma(norma);

    expect(datos).toEqual({
      numero: null,
      titulo: 'Norma de prueba',
      contenido: [],
      tipoNorma: 'Ley',
      institucionExpide: 'Asamblea Nacional',
      estadoJuridico: 'VIGENTE',
      fechaExpedicion: new Date('2025-01-01T00:00:00.000Z'),
    });
    expect(datos).not.toHaveProperty('id');
    expect(datos).not.toHaveProperty('estadoEditorial');
    expect(datos).not.toHaveProperty('edicionRegistroOficialId');
    expect(datos).not.toHaveProperty('fechaPublicacionEnSistema');
  });

  it('mapearEdicionRegistroOficialDesdePrisma reconstruye la edición', () => {
    const edicion = mapearEdicionRegistroOficialDesdePrisma(
      filaEdicion() as never,
    );

    expect(edicion.id).toBe('edicion-1');
    expect(edicion.urlPdf).toBe(
      'https://www.registroficial.gob.ec/ediciones/ro-500.pdf',
    );
    expect(edicion.estadoResolucionFuente).toBe(
      EstadoResolucionFuente.RESUELTA,
    );
  });

  it('mapearEdicionRegistroOficialDesdePrisma rechaza estadoResolucionFuente desconocido', () => {
    expect(() =>
      mapearEdicionRegistroOficialDesdePrisma(
        filaEdicion({ estadoResolucionFuente: 'INVENTADO', urlPdf: null }) as never,
      ),
    ).toThrow(
      /EdicionRegistroOficial\.estadoResolucionFuente \(id edicion-1\): 'INVENTADO'/,
    );
  });

  it('mapearNormaDesdePrisma rechaza estadoJuridico desconocido identificando el registro', () => {
    expect(() =>
      mapearNormaDesdePrisma(filaNorma({ estadoJuridico: 'INVENTADO' }) as never),
    ).toThrow(/Norma\.estadoJuridico \(id norma-1\): 'INVENTADO'/);
  });

  it('mapearNormaDesdePrisma rechaza estadoEditorial desconocido', () => {
    expect(() =>
      mapearNormaDesdePrisma(filaNorma({ estadoEditorial: 'ARCHIVADA' }) as never),
    ).toThrow(/Norma\.estadoEditorial \(id norma-1\): 'ARCHIVADA'/);
  });

  it('mapearUsuarioDesdePrisma reconstruye rol válido y rechaza rol desconocido', () => {
    const usuario = mapearUsuarioDesdePrisma(filaUsuario() as never);
    expect(usuario.tieneRol(RolUsuario.EDITOR)).toBe(true);

    expect(() =>
      mapearUsuarioDesdePrisma(filaUsuario({ rol: 'ROOT' }) as never),
    ).toThrow(/Usuario\.rol \(id usuario-1\): 'ROOT'/);
  });

  it('mapearSuscripcionDesdePrisma reconstruye estado válido y rechaza estado desconocido', () => {
    const suscripcion = mapearSuscripcionDesdePrisma(filaSuscripcion() as never);
    expect(suscripcion.estado).toBe(EstadoSuscripcion.ACTIVA);

    expect(() =>
      mapearSuscripcionDesdePrisma(filaSuscripcion({ estado: 'PAUSADA' }) as never),
    ).toThrow(/Suscripcion\.estado \(id suscripcion-1\): 'PAUSADA'/);
  });
});
