import { CatalogoRegistroOficial } from '@normativo/aplicacion';
import {
  ConfiguracionCatalogoRegistroOficial,
  MAX_BYTES_RESPUESTA_CATALOGO,
} from '../../configuracion/catalogo-registro-oficial';
import { CatalogoRegistroOficialHttp } from './CatalogoRegistroOficialHttp';

/**
 * Construye el adaptador HTTP real del catálogo solo si la integración está
 * habilitada y correctamente configurada; de lo contrario devuelve undefined
 * para que el caso de uso responda CATALOGO_NO_DISPONIBLE (503).
 */
export function construirCatalogoRegistroOficial(
  configuracion: ConfiguracionCatalogoRegistroOficial,
): CatalogoRegistroOficial | undefined {
  if (!configuracion.habilitado) {
    return undefined;
  }
  return new CatalogoRegistroOficialHttp({
    baseUrl: configuracion.baseUrl,
    dominiosPdfPermitidos: configuracion.dominiosPdfPermitidos,
    timeoutMs: configuracion.timeoutMs,
    maxBytesRespuesta: MAX_BYTES_RESPUESTA_CATALOGO,
    aniosExtra: configuracion.aniosExtra,
  });
}
