import { EdicionRegistroOficial, EstadoResolucionFuente } from '@normativo/dominio';

/** Contrato de lectura de una edición del Registro Oficial. */
export type EdicionRegistroOficialConsultada = {
  id: string;
  tipoPublicacionRegistroOficial: string;
  numeroPublicacionRegistroOficial: number;
  fechaPublicacionOficial: string;
  urlPdf: string | null;
  estadoResolucionFuente: EstadoResolucionFuente;
};

export function armarEdicionRegistroOficialConsultada(
  edicion: EdicionRegistroOficial,
): EdicionRegistroOficialConsultada {
  return {
    id: edicion.id,
    tipoPublicacionRegistroOficial: edicion.tipoPublicacionRegistroOficial,
    numeroPublicacionRegistroOficial: edicion.numeroPublicacionRegistroOficial,
    fechaPublicacionOficial: edicion.fechaPublicacionOficial
      .toISOString()
      .slice(0, 10),
    urlPdf: edicion.urlPdf,
    estadoResolucionFuente: edicion.estadoResolucionFuente,
  };
}
