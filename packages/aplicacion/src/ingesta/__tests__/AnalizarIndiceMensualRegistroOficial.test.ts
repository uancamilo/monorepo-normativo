import { describe, expect, it } from '@jest/globals';
import { RolUsuario } from '@normativo/dominio';
import { AnalizarIndiceMensualRegistroOficial } from '../casos-uso/AnalizarIndiceMensualRegistroOficial';
import {
  crearEntradaDetectada,
  crearUsuarioConRol,
  RepositorioUsuariosFake,
} from './apoyo/fakes-ingesta';
import {
  DescargadorPdfIndiceFake,
  ExtractorIndiceMensualFake,
} from './apoyo/fakes-descarga-extraccion';

const URL_VALIDA = 'https://esacc.corteconstitucional.gob.ec/storage/x';

function crearContexto() {
  const repositorioUsuarios = new RepositorioUsuariosFake();
  const descargadorPdf = new DescargadorPdfIndiceFake();
  const extractorIndice = new ExtractorIndiceMensualFake();
  const casoUso = new AnalizarIndiceMensualRegistroOficial({
    repositorioUsuarios,
    descargadorPdf,
    extractorIndice,
  });
  return { casoUso, repositorioUsuarios, descargadorPdf, extractorIndice };
}

function solicitudValida(usuarioAutenticadoId: string) {
  return {
    usuarioAutenticadoId,
    urlPdf: URL_VALIDA,
    periodoEsperado: { anio: 2026, mes: 5 },
  };
}

describe('AnalizarIndiceMensualRegistroOficial', () => {
  it('SUPERADMINISTRADOR: analiza con éxito y devuelve la previsualización completa', async () => {
    const { casoUso, repositorioUsuarios, extractorIndice } = crearContexto();
    repositorioUsuarios.agregar(
      crearUsuarioConRol(RolUsuario.SUPERADMINISTRADOR),
    );
    extractorIndice.configurarExito({ anio: 2026, mes: 5 }, [
      crearEntradaDetectada({ posicion: 0, advertencias: [] }),
      crearEntradaDetectada({
        posicion: 1,
        advertencias: ['TITULO_NO_DETECTADO'],
      }),
    ]);

    const resultado = await casoUso.ejecutar(
      solicitudValida('usuario-SUPERADMINISTRADOR'),
    );

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) return;
    expect(resultado.analisis.periodoEsperado).toEqual({ anio: 2026, mes: 5 });
    expect(resultado.analisis.periodoDetectado).toEqual({ anio: 2026, mes: 5 });
    expect(resultado.analisis.totalEntradas).toBe(2);
    expect(resultado.entradasDetectadas).toHaveLength(2);
  });

  it.each([RolUsuario.EDITOR, RolUsuario.ADMINISTRADOR, RolUsuario.SUSCRIPTOR])(
    '%s: ACCESO_DENEGADO, sin invocar la descarga',
    async (rol) => {
      const { casoUso, repositorioUsuarios, descargadorPdf } =
        crearContexto();
      repositorioUsuarios.agregar(crearUsuarioConRol(rol, `usuario-${rol}`));

      const resultado = await casoUso.ejecutar(
        solicitudValida(`usuario-${rol}`),
      );

      expect(resultado).toEqual({ exitoso: false, razon: 'ACCESO_DENEGADO' });
      expect(descargadorPdf.llamadas).toHaveLength(0);
    },
  );

  it('usuario inexistente: ACCESO_DENEGADO, sin invocar la descarga', async () => {
    const { casoUso, descargadorPdf } = crearContexto();

    const resultado = await casoUso.ejecutar(
      solicitudValida('usuario-fantasma'),
    );

    expect(resultado).toEqual({ exitoso: false, razon: 'ACCESO_DENEGADO' });
    expect(descargadorPdf.llamadas).toHaveLength(0);
  });

  it('sin autorización, tampoco se invoca el extractor (fail-fast antes de cualquier red/CPU)', async () => {
    const { casoUso, extractorIndice } = crearContexto();

    await casoUso.ejecutar(solicitudValida('usuario-fantasma'));

    expect(extractorIndice.llamadas).toBe(0);
  });

  it('SOLICITUD_INVALIDA: urlPdf vacío', async () => {
    const { casoUso, repositorioUsuarios } = crearContexto();
    repositorioUsuarios.agregar(
      crearUsuarioConRol(RolUsuario.SUPERADMINISTRADOR),
    );

    const resultado = await casoUso.ejecutar({
      ...solicitudValida('usuario-SUPERADMINISTRADOR'),
      urlPdf: '   ',
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
  });

  it.each([
    ['año fuera de rango', { anio: 1800, mes: 5 }],
    ['mes 0', { anio: 2026, mes: 0 }],
    ['mes 13', { anio: 2026, mes: 13 }],
  ])('SOLICITUD_INVALIDA: periodoEsperado inválido (%s)', async (_n, periodoEsperado) => {
    const { casoUso, repositorioUsuarios } = crearContexto();
    repositorioUsuarios.agregar(
      crearUsuarioConRol(RolUsuario.SUPERADMINISTRADOR),
    );

    const resultado = await casoUso.ejecutar({
      ...solicitudValida('usuario-SUPERADMINISTRADOR'),
      periodoEsperado,
    });

    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
  });

  it('propaga tal cual la razón de descarga fallida, sin invocar el extractor', async () => {
    const { casoUso, repositorioUsuarios, descargadorPdf, extractorIndice } =
      crearContexto();
    repositorioUsuarios.agregar(
      crearUsuarioConRol(RolUsuario.SUPERADMINISTRADOR),
    );
    descargadorPdf.configurarFallo('PDF_INDICE_DEMASIADO_GRANDE');

    const resultado = await casoUso.ejecutar(
      solicitudValida('usuario-SUPERADMINISTRADOR'),
    );

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'PDF_INDICE_DEMASIADO_GRANDE',
    });
    expect(extractorIndice.llamadas).toBe(0);
  });

  it('propaga tal cual la razón de extracción fallida', async () => {
    const { casoUso, repositorioUsuarios, extractorIndice } = crearContexto();
    repositorioUsuarios.agregar(
      crearUsuarioConRol(RolUsuario.SUPERADMINISTRADOR),
    );
    extractorIndice.configurarFallo('PDF_INDICE_CIFRADO');

    const resultado = await casoUso.ejecutar(
      solicitudValida('usuario-SUPERADMINISTRADOR'),
    );

    expect(resultado).toEqual({ exitoso: false, razon: 'PDF_INDICE_CIFRADO' });
  });

  it('PERIODO_INDICE_NO_COINCIDE: período detectado distinto del esperado', async () => {
    const { casoUso, repositorioUsuarios, extractorIndice } = crearContexto();
    repositorioUsuarios.agregar(
      crearUsuarioConRol(RolUsuario.SUPERADMINISTRADOR),
    );
    extractorIndice.configurarExito({ anio: 2026, mes: 6 });

    const resultado = await casoUso.ejecutar(
      solicitudValida('usuario-SUPERADMINISTRADOR'),
    );

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'PERIODO_INDICE_NO_COINCIDE',
    });
  });

  it('conteos deterministas: totalConAdvertencias y advertenciasPorTipo', async () => {
    const { casoUso, repositorioUsuarios, extractorIndice } = crearContexto();
    repositorioUsuarios.agregar(
      crearUsuarioConRol(RolUsuario.SUPERADMINISTRADOR),
    );
    extractorIndice.configurarExito({ anio: 2026, mes: 5 }, [
      crearEntradaDetectada({ posicion: 0, advertencias: [] }),
      crearEntradaDetectada({
        posicion: 1,
        advertencias: ['TITULO_NO_DETECTADO'],
      }),
      crearEntradaDetectada({
        posicion: 2,
        advertencias: ['TITULO_NO_DETECTADO', 'NUMERO_NORMA_NO_DETECTADO'],
      }),
    ]);

    const resultado = await casoUso.ejecutar(
      solicitudValida('usuario-SUPERADMINISTRADOR'),
    );

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) return;
    expect(resultado.analisis.totalEntradas).toBe(3);
    expect(resultado.analisis.totalConAdvertencias).toBe(2);
    expect(resultado.analisis.advertenciasPorTipo).toEqual({
      TITULO_NO_DETECTADO: 2,
      NUMERO_NORMA_NO_DETECTADO: 1,
    });
  });

  it('la versión reportada es la que expone el puerto de extracción (fuente única de verdad)', async () => {
    const repositorioUsuarios = new RepositorioUsuariosFake();
    repositorioUsuarios.agregar(
      crearUsuarioConRol(RolUsuario.SUPERADMINISTRADOR),
    );
    const descargadorPdf = new DescargadorPdfIndiceFake();
    const extractorIndice = new ExtractorIndiceMensualFake('indice-mensual-v7-de-prueba');
    const casoUso = new AnalizarIndiceMensualRegistroOficial({
      repositorioUsuarios,
      descargadorPdf,
      extractorIndice,
    });

    const resultado = await casoUso.ejecutar(
      solicitudValida('usuario-SUPERADMINISTRADOR'),
    );

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) return;
    expect(resultado.analisis.versionExtractor).toBe(
      'indice-mensual-v7-de-prueba',
    );
  });

  it('sha256Pdf y tamanioBytes provienen exactamente del resultado del descargador', async () => {
    const { casoUso, repositorioUsuarios, descargadorPdf } = crearContexto();
    repositorioUsuarios.agregar(
      crearUsuarioConRol(RolUsuario.SUPERADMINISTRADOR),
    );
    const bytes = new Uint8Array(1234);
    descargadorPdf.configurarExito(bytes, 'a'.repeat(64));

    const resultado = await casoUso.ejecutar(
      solicitudValida('usuario-SUPERADMINISTRADOR'),
    );

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) return;
    expect(resultado.analisis.sha256Pdf).toBe('a'.repeat(64));
    expect(resultado.analisis.tamanioBytes).toBe(1234);
  });
});
