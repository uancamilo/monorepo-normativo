import { beforeEach, describe, expect, it } from '@jest/globals';
import { RolUsuario } from '@normativo/dominio';
import { IngerirResumenRegistroOficial } from '../casos-uso/IngerirResumenRegistroOficial';
import { ConsultarLotesIngestaRegistroOficial } from '../casos-uso/ConsultarLotesIngestaRegistroOficial';
import { ConsultarLoteIngestaRegistroOficial } from '../casos-uso/ConsultarLoteIngestaRegistroOficial';
import {
  crearEntradaDetectada,
  crearSolicitudIngesta,
  crearUsuarioConRol,
  GeneradorIdsSecuencialFake,
  RepositorioIngestaRegistroOficialFake,
  RepositorioUsuariosFake,
} from './apoyo/fakes-ingesta';
import { RepositorioEdicionesRegistroOficialEnMemoriaFake } from '../../normas/casos-uso/__tests__/apoyo/fakes-normas-editorial';

describe('Consultar lotes de ingesta del Registro Oficial', () => {
  let repositorioUsuarios: RepositorioUsuariosFake;
  let repositorioIngesta: RepositorioIngestaRegistroOficialFake;
  let consultarLotes: ConsultarLotesIngestaRegistroOficial;
  let consultarLote: ConsultarLoteIngestaRegistroOficial;
  let loteId: string;
  let ingerir: IngerirResumenRegistroOficial;

  beforeEach(async () => {
    repositorioUsuarios = new RepositorioUsuariosFake();
    repositorioIngesta = new RepositorioIngestaRegistroOficialFake();
    for (const rol of [
      RolUsuario.SUPERADMINISTRADOR,
      RolUsuario.EDITOR,
      RolUsuario.ADMINISTRADOR,
      RolUsuario.SUSCRIPTOR,
    ]) {
      repositorioUsuarios.agregar(crearUsuarioConRol(rol));
    }
    ingerir = new IngerirResumenRegistroOficial({
      repositorioUsuarios,
      repositorioIngesta,
      repositorioEdiciones: new RepositorioEdicionesRegistroOficialEnMemoriaFake(),
      generadorIds: new GeneradorIdsSecuencialFake(),
    });
    const ingesta = await ingerir.ejecutar(
      crearSolicitudIngesta({
        entradasDetectadas: [
          crearEntradaDetectada({ posicion: 0 }),
          crearEntradaDetectada({
            posicion: 1,
            numero: '999',
            advertencias: ['FILA_PDF_CORTADA'],
          }),
          crearEntradaDetectada({
            posicion: 2,
            titulo: '  ',
            numero: '789',
          }),
        ],
      }),
    );
    expect(ingesta.exitoso).toBe(true);
    loteId = ingesta.exitoso ? ingesta.lote.id : '';

    consultarLotes = new ConsultarLotesIngestaRegistroOficial({
      repositorioUsuarios,
      repositorioIngesta,
    });
    consultarLote = new ConsultarLoteIngestaRegistroOficial({
      repositorioUsuarios,
      repositorioIngesta,
    });
  });

  it.each([RolUsuario.SUPERADMINISTRADOR])(
    '%s puede consultar los lotes con métricas derivadas',
    async (rol) => {
      const resultado = await consultarLotes.ejecutar({
        usuarioAutenticadoId: `usuario-${rol}`,
      });

      expect(resultado.exitoso).toBe(true);
      if (!resultado.exitoso) {
        return;
      }
      expect(resultado.lotes).toHaveLength(1);
      expect(resultado.lotes[0].totalEntradasDetectadas).toBe(3);
      expect(resultado.lotes[0].totalConAdvertencias).toBe(2);
      expect(resultado.lotes[0]).not.toHaveProperty('creadoPorUsuarioId');
      expect(resultado.lotes[0]).not.toHaveProperty('fuente');
    },
  );

  it.each([RolUsuario.EDITOR, RolUsuario.ADMINISTRADOR, RolUsuario.SUSCRIPTOR])(
    '%s no puede consultar lotes (ACCESO_DENEGADO): los lotes son control tecnico',
    async (rol) => {
      const resultado = await consultarLotes.ejecutar({
        usuarioAutenticadoId: `usuario-${rol}`,
      });

      expect(resultado).toEqual({ exitoso: false, razon: 'ACCESO_DENEGADO' });
    },
  );

  it('actor inexistente no puede consultar lotes', async () => {
    const resultado = await consultarLotes.ejecutar({
      usuarioAutenticadoId: 'usuario-fantasma',
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'ACCESO_DENEGADO' });
  });

  it.each([RolUsuario.SUPERADMINISTRADOR])(
    '%s puede consultar un lote completo con entradas anidadas ordenadas por posición',
    async (rol) => {
      const resultado = await consultarLote.ejecutar({
        usuarioAutenticadoId: `usuario-${rol}`,
        loteId,
      });

      expect(resultado.exitoso).toBe(true);
      if (!resultado.exitoso) {
        return;
      }
      expect(resultado.lote.id).toBe(loteId);
      expect(resultado.lote.entradasDetectadas.map((i) => i.posicion)).toEqual([
        0, 1, 2,
      ]);
      expect(resultado.lote.entradasDetectadas[0].resultadoDeteccion).toBe(
        'ENTRADA_DETECTADA',
      );
      expect(resultado.lote.entradasDetectadas[1].resultadoDeteccion).toBe(
        'ENTRADA_CON_ADVERTENCIAS',
      );
      expect(resultado.lote.entradasDetectadas[2].resultadoDeteccion).toBe(
        'ENTRADA_CON_ADVERTENCIAS',
      );
    },
  );

  it.each([RolUsuario.EDITOR, RolUsuario.ADMINISTRADOR, RolUsuario.SUSCRIPTOR])(
    '%s no puede consultar lote completo (ACCESO_DENEGADO)',
    async (rol) => {
      const resultado = await consultarLote.ejecutar({
        usuarioAutenticadoId: `usuario-${rol}`,
        loteId,
      });

      expect(resultado).toEqual({ exitoso: false, razon: 'ACCESO_DENEGADO' });
    },
  );

  it('lote inexistente devuelve LOTE_NO_ENCONTRADO', async () => {
    const resultado = await consultarLote.ejecutar({
      usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
      loteId: 'lote-fantasma',
    });

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'LOTE_NO_ENCONTRADO',
    });
  });

  it('loteId vacío es SOLICITUD_INVALIDA', async () => {
    const resultado = await consultarLote.ejecutar({
      usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
      loteId: '   ',
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
  });

  it('con varios lotes usa una sola consulta batch de entradas, no N+1 (H-B1)', async () => {
    // Reutiliza el mismo `ingerir` (y su GeneradorIdsSecuencialFake) del
    // beforeEach: una segunda instancia con contador propio generaría el
    // mismo id-1 que el primer lote y los fusionaría en el repositorio fake.
    const segundaIngesta = await ingerir.ejecutar(
      crearSolicitudIngesta({
        periodo: { anio: 2026, mes: 6 },
        urlResumenMensualRegistroOficial:
          'https://www.registroficial.gob.ec/resumen-2026-06.pdf',
        entradasDetectadas: [
          crearEntradaDetectada({ posicion: 0 }),
          crearEntradaDetectada({ posicion: 1, numero: '111' }),
        ],
      }),
    );
    expect(segundaIngesta.exitoso).toBe(true);

    const spyListarLotes = jest.spyOn(repositorioIngesta, 'listarLotes');
    const spyListarEntradasPorLoteIds = jest.spyOn(
      repositorioIngesta,
      'listarEntradasPorLoteIds',
    );
    const spyListarEntradasPorLoteId = jest.spyOn(
      repositorioIngesta,
      'listarEntradasPorLoteId',
    );

    const resultado = await consultarLotes.ejecutar({
      usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
    });

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) {
      return;
    }
    expect(resultado.lotes).toHaveLength(2);
    expect(spyListarLotes).toHaveBeenCalledTimes(1);
    expect(spyListarEntradasPorLoteIds).toHaveBeenCalledTimes(1);
    expect(spyListarEntradasPorLoteId).not.toHaveBeenCalled();

    // El orden de salida sigue exactamente el de listarLotes(), sin alterarlo.
    const idsEnOrdenListarLotes = (await spyListarLotes.mock.results[0].value).map(
      (lote: { id: string }) => lote.id,
    );
    expect(resultado.lotes.map((lote) => lote.id)).toEqual(idsEnOrdenListarLotes);

    const loteConTres = resultado.lotes.find((lote) => lote.id === loteId);
    expect(loteConTres?.totalEntradasDetectadas).toBe(3);
    const loteConDos = resultado.lotes.find(
      (lote) => lote.id !== loteId,
    );
    expect(loteConDos?.totalEntradasDetectadas).toBe(2);
  });

  it('sin lotes no consulta entradas y devuelve lista vacía', async () => {
    const repositorioUsuariosVacio = new RepositorioUsuariosFake();
    repositorioUsuariosVacio.agregar(
      crearUsuarioConRol(RolUsuario.SUPERADMINISTRADOR),
    );
    const repositorioIngestaVacio = new RepositorioIngestaRegistroOficialFake();
    const spyListarEntradasPorLoteIds = jest.spyOn(
      repositorioIngestaVacio,
      'listarEntradasPorLoteIds',
    );
    const consultarLotesVacio = new ConsultarLotesIngestaRegistroOficial({
      repositorioUsuarios: repositorioUsuariosVacio,
      repositorioIngesta: repositorioIngestaVacio,
    });

    const resultado = await consultarLotesVacio.ejecutar({
      usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
    });

    expect(resultado).toEqual({ exitoso: true, lotes: [] });
    expect(spyListarEntradasPorLoteIds).not.toHaveBeenCalled();
  });
});
