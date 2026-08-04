import { describe, expect, it } from '@jest/globals';
import { EstadoResolucionFuente, RolUsuario } from '@normativo/dominio';
import { ConfirmarIngestaIndiceMensualRegistroOficial } from '../casos-uso/ConfirmarIngestaIndiceMensualRegistroOficial';
import { IngerirResumenRegistroOficial } from '../casos-uso/IngerirResumenRegistroOficial';
import {
  crearEntradaDetectada,
  crearUsuarioConRol,
  GeneradorIdsSecuencialFake,
  RepositorioIngestaRegistroOficialFake,
  RepositorioUsuariosFake,
} from './apoyo/fakes-ingesta';
import { RepositorioEdicionesRegistroOficialEnMemoriaFake } from '../../normas/casos-uso/__tests__/apoyo/fakes-normas-editorial';
import {
  DescargadorPdfIndiceFake,
  ExtractorIndiceMensualFake,
} from './apoyo/fakes-descarga-extraccion';

const URL_VALIDA = 'https://esacc.corteconstitucional.gob.ec/storage/x';
const SHA_VALIDO = 'a'.repeat(64);
const VERSION_ACTUAL = 'indice-mensual-v1';

function crearContexto() {
  const repositorioUsuarios = new RepositorioUsuariosFake();
  repositorioUsuarios.agregar(
    crearUsuarioConRol(RolUsuario.SUPERADMINISTRADOR),
  );
  const repositorioEdiciones =
    new RepositorioEdicionesRegistroOficialEnMemoriaFake();
  const repositorioIngesta = new RepositorioIngestaRegistroOficialFake(
    repositorioEdiciones,
  );
  const ingerirResumen = new IngerirResumenRegistroOficial({
    repositorioUsuarios,
    repositorioIngesta,
    repositorioEdiciones,
    generadorIds: new GeneradorIdsSecuencialFake(),
  });
  const descargadorPdf = new DescargadorPdfIndiceFake();
  descargadorPdf.configurarExito(new Uint8Array([1, 2, 3]), SHA_VALIDO);
  const extractorIndice = new ExtractorIndiceMensualFake(VERSION_ACTUAL);
  extractorIndice.configurarExito({ anio: 2026, mes: 5 }, [
    crearEntradaDetectada({ posicion: 0 }),
  ]);

  const casoUso = new ConfirmarIngestaIndiceMensualRegistroOficial({
    repositorioUsuarios,
    descargadorPdf,
    extractorIndice,
    ingerirResumen,
  });

  return {
    casoUso,
    repositorioUsuarios,
    repositorioIngesta,
    repositorioEdiciones,
    descargadorPdf,
    extractorIndice,
  };
}

function solicitudValida(overrides: Partial<{
  usuarioAutenticadoId: string;
  urlPdf: string;
  periodoEsperado: { anio: number; mes: number };
  sha256PdfObservado: string;
  versionExtractorObservada: string;
}> = {}) {
  return {
    usuarioAutenticadoId: 'usuario-SUPERADMINISTRADOR',
    urlPdf: URL_VALIDA,
    periodoEsperado: { anio: 2026, mes: 5 },
    sha256PdfObservado: SHA_VALIDO,
    versionExtractorObservada: VERSION_ACTUAL,
    ...overrides,
  };
}

describe('ConfirmarIngestaIndiceMensualRegistroOficial', () => {
  it('confirma con éxito: delega en IngerirResumenRegistroOficial y devuelve lote/creado/sha256/versión', async () => {
    const { casoUso } = crearContexto();

    const resultado = await casoUso.ejecutar(solicitudValida());

    expect(resultado.exitoso).toBe(true);
    if (!resultado.exitoso) return;
    expect(resultado.creado).toBe(true);
    expect(resultado.lote.periodoAnio).toBe(2026);
    expect(resultado.lote.periodoMes).toBe(5);
    expect(resultado.sha256Pdf).toBe(SHA_VALIDO);
    expect(resultado.versionExtractor).toBe(VERSION_ACTUAL);
  });

  it('la URL confirmada se persiste como urlResumenMensualRegistroOficial del lote (participa en la huella)', async () => {
    const { casoUso, repositorioIngesta } = crearContexto();

    await casoUso.ejecutar(solicitudValida());

    const lote = await repositorioIngesta.buscarLotePorPeriodo(2026, 5);
    expect(lote?.urlResumenMensualRegistroOficial).toBe(URL_VALIDA);
  });

  it.each([RolUsuario.EDITOR, RolUsuario.ADMINISTRADOR, RolUsuario.SUSCRIPTOR])(
    '%s: ACCESO_DENEGADO, sin invocar descarga ni extracción',
    async (rol) => {
      const { casoUso, repositorioUsuarios, descargadorPdf, extractorIndice } =
        crearContexto();
      repositorioUsuarios.agregar(crearUsuarioConRol(rol, `usuario-${rol}`));

      const resultado = await casoUso.ejecutar(
        solicitudValida({ usuarioAutenticadoId: `usuario-${rol}` }),
      );

      expect(resultado).toEqual({ exitoso: false, razon: 'ACCESO_DENEGADO' });
      expect(descargadorPdf.llamadas).toHaveLength(0);
      expect(extractorIndice.llamadas).toBe(0);
    },
  );

  it('SOLICITUD_INVALIDA: sha256PdfObservado con formato inválido', async () => {
    const { casoUso } = crearContexto();
    const resultado = await casoUso.ejecutar(
      solicitudValida({ sha256PdfObservado: 'no-es-un-sha256' }),
    );
    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
  });

  it('SOLICITUD_INVALIDA: versionExtractorObservada vacía', async () => {
    const { casoUso } = crearContexto();
    const resultado = await casoUso.ejecutar(
      solicitudValida({ versionExtractorObservada: '   ' }),
    );
    expect(resultado).toEqual({ exitoso: false, razon: 'SOLICITUD_INVALIDA' });
  });

  it('VERSION_EXTRACTOR_CAMBIO_DESDE_ANALISIS: versión distinta, sin descargar', async () => {
    const { casoUso, descargadorPdf, extractorIndice } = crearContexto();

    const resultado = await casoUso.ejecutar(
      solicitudValida({ versionExtractorObservada: 'indice-mensual-v0-vieja' }),
    );

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'VERSION_EXTRACTOR_CAMBIO_DESDE_ANALISIS',
    });
    expect(descargadorPdf.llamadas).toHaveLength(0);
    expect(extractorIndice.llamadas).toBe(0);
  });

  it('PDF_INDICE_CAMBIO_DESDE_ANALISIS: hash recalculado distinto del observado, sin extraer', async () => {
    const { casoUso, descargadorPdf, extractorIndice } = crearContexto();
    descargadorPdf.configurarExito(new Uint8Array([9, 9]), 'b'.repeat(64));

    const resultado = await casoUso.ejecutar(solicitudValida());

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'PDF_INDICE_CAMBIO_DESDE_ANALISIS',
    });
    expect(extractorIndice.llamadas).toBe(0);
  });

  it('PERIODO_INDICE_NO_COINCIDE: período detectado distinto, sin ingerir', async () => {
    const { casoUso, extractorIndice, repositorioIngesta } = crearContexto();
    extractorIndice.configurarExito({ anio: 2026, mes: 6 });

    const resultado = await casoUso.ejecutar(solicitudValida());

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'PERIODO_INDICE_NO_COINCIDE',
    });
    expect(await repositorioIngesta.buscarLotePorPeriodo(2026, 5)).toBeNull();
    expect(await repositorioIngesta.buscarLotePorPeriodo(2026, 6)).toBeNull();
  });

  it('propaga la razón de descarga fallida sin invocar la extracción ni la ingesta', async () => {
    const { casoUso, descargadorPdf, extractorIndice, repositorioIngesta } =
      crearContexto();
    descargadorPdf.configurarFallo('DESCARGA_INDICE_TEMPORALMENTE_NO_DISPONIBLE');

    const resultado = await casoUso.ejecutar(solicitudValida());

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'DESCARGA_INDICE_TEMPORALMENTE_NO_DISPONIBLE',
    });
    expect(extractorIndice.llamadas).toBe(0);
    expect(await repositorioIngesta.buscarLotePorPeriodo(2026, 5)).toBeNull();
  });

  it('propaga la razón de extracción fallida sin ingerir', async () => {
    const { casoUso, extractorIndice, repositorioIngesta } = crearContexto();
    extractorIndice.configurarFallo('PDF_INDICE_SIN_CAPA_DE_TEXTO');

    const resultado = await casoUso.ejecutar(solicitudValida());

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'PDF_INDICE_SIN_CAPA_DE_TEXTO',
    });
    expect(await repositorioIngesta.buscarLotePorPeriodo(2026, 5)).toBeNull();
  });

  it('reintento idéntico (misma URL, mismas entradas, misma versión): creado=false, mismo lote', async () => {
    const { casoUso } = crearContexto();

    const primera = await casoUso.ejecutar(solicitudValida());
    const segunda = await casoUso.ejecutar(solicitudValida());

    expect(primera.exitoso).toBe(true);
    expect(segunda.exitoso).toBe(true);
    if (!primera.exitoso || !segunda.exitoso) return;
    expect(primera.creado).toBe(true);
    expect(segunda.creado).toBe(false);
    expect(segunda.lote.id).toBe(primera.lote.id);
  });

  it('mismo período con URL de PDF diferente: EJECUCION_INGESTA_CONFLICTIVA aunque el contenido/entradas coincidan', async () => {
    const { casoUso } = crearContexto();
    await casoUso.ejecutar(solicitudValida());

    const resultado = await casoUso.ejecutar(
      solicitudValida({ urlPdf: `${URL_VALIDA}-otra-url` }),
    );

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'EJECUCION_INGESTA_CONFLICTIVA',
    });
  });

  it('mismo período con contenido (entradas) diferente: EJECUCION_INGESTA_CONFLICTIVA', async () => {
    const { casoUso, extractorIndice } = crearContexto();
    await casoUso.ejecutar(solicitudValida());

    extractorIndice.configurarExito({ anio: 2026, mes: 5 }, [
      crearEntradaDetectada({ posicion: 0, titulo: 'Título completamente distinto' }),
    ]);
    const resultado = await casoUso.ejecutar(solicitudValida());

    expect(resultado).toEqual({
      exitoso: false,
      razon: 'EJECUCION_INGESTA_CONFLICTIVA',
    });
  });

  it('no resuelve fuentes ni publica normas: el lote resultante conserva sus ediciones PENDIENTE y las normas en BORRADOR', async () => {
    const { casoUso, repositorioEdiciones } = crearContexto();

    const resultado = await casoUso.ejecutar(solicitudValida());

    expect(resultado.exitoso).toBe(true);
    const ediciones = await repositorioEdiciones.listar();
    for (const edicion of ediciones) {
      expect(edicion.estadoResolucionFuente).toBe(
        EstadoResolucionFuente.PENDIENTE,
      );
    }
  });
});
