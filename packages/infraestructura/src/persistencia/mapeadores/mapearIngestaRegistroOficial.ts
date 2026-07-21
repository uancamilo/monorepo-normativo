import {
  EntradaDetectadaRegistroOficialAPersistir,
  LoteIngestaRegistroOficial,
} from '@normativo/aplicacion';
import {
  EntradaDetectadaRegistroOficial as EntradaDetectadaPrisma,
  LoteIngestaRegistroOficial as LoteIngestaPrisma,
  Prisma,
} from '@prisma/client';

export function mapearLoteIngestaDesdePrisma(
  lote: LoteIngestaPrisma,
): LoteIngestaRegistroOficial {
  return {
    id: lote.id,
    huellaLote: lote.huellaLote,
    periodoAnio: lote.periodoAnio,
    periodoMes: lote.periodoMes,
    fechaEjecucion: lote.fechaEjecucion,
    urlResumenMensualRegistroOficial:
      lote.urlResumenMensualRegistroOficial,
    versionExtractor: lote.versionExtractor,
  };
}

export function mapearLoteIngestaADataPrisma(lote: LoteIngestaRegistroOficial) {
  return {
    id: lote.id,
    huellaLote: lote.huellaLote,
    periodoAnio: lote.periodoAnio,
    periodoMes: lote.periodoMes,
    fechaEjecucion: lote.fechaEjecucion,
    urlResumenMensualRegistroOficial:
      lote.urlResumenMensualRegistroOficial,
    versionExtractor: lote.versionExtractor,
  };
}

export function mapearEntradaDetectadaDesdePrisma(
  entrada: EntradaDetectadaPrisma,
): EntradaDetectadaRegistroOficialAPersistir {
  return {
    id: entrada.id,
    loteId: entrada.loteId,
    posicion: entrada.posicion,
    normaId: entrada.normaId,
    segmentoCrudo: entrada.segmentoCrudo,
    metadataExtraccion: mapearJsonAObjeto(entrada.metadataExtraccion),
    advertencias: mapearJsonAListaTexto(entrada.advertencias),
    confianza: entrada.confianza,
    fechaCreacion: entrada.createdAt,
    tipoDetectado: entrada.tipoDetectado,
    numeroDetectado: entrada.numeroDetectado,
    tituloDetectado: entrada.tituloDetectado,
    institucionDetectada: entrada.institucionDetectada,
    seccion: entrada.seccion,
    publicacionTipo: entrada.publicacionTipo,
    publicacionNumero: entrada.publicacionNumero,
    publicacionFecha: entrada.publicacionFecha,
  };
}

export function mapearEntradaDetectadaADataPrisma(
  entrada: EntradaDetectadaRegistroOficialAPersistir,
) {
  return {
    id: entrada.id,
    loteId: entrada.loteId,
    posicion: entrada.posicion,
    normaId: entrada.normaId,
    segmentoCrudo: entrada.segmentoCrudo,
    metadataExtraccion: entrada.metadataExtraccion as Prisma.InputJsonValue,
    tipoDetectado: entrada.tipoDetectado,
    numeroDetectado: entrada.numeroDetectado,
    tituloDetectado: entrada.tituloDetectado,
    institucionDetectada: entrada.institucionDetectada,
    seccion: entrada.seccion,
    publicacionTipo: entrada.publicacionTipo,
    publicacionNumero: entrada.publicacionNumero,
    publicacionFecha: entrada.publicacionFecha,
    advertencias: entrada.advertencias as Prisma.InputJsonValue,
    confianza: entrada.confianza,
    createdAt: entrada.fechaCreacion,
  };
}

function mapearJsonAObjeto(valor: Prisma.JsonValue): Record<string, unknown> {
  if (valor !== null && typeof valor === 'object' && !Array.isArray(valor)) {
    return valor as Record<string, unknown>;
  }
  return {};
}

function mapearJsonAListaTexto(valor: Prisma.JsonValue): string[] {
  if (!Array.isArray(valor)) {
    return [];
  }
  return valor.filter((elemento): elemento is string => typeof elemento === 'string');
}
