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

/** Vista contractual para usuarios sin participación en el proceso editorial. */
export type EdicionRegistroOficialPublica = Omit<
  EdicionRegistroOficialConsultada,
  'estadoResolucionFuente'
>;

export type EdicionRegistroOficialVisible =
  | EdicionRegistroOficialConsultada
  | EdicionRegistroOficialPublica;

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

export function armarEdicionRegistroOficialPublica(
  edicion: EdicionRegistroOficial,
): EdicionRegistroOficialPublica {
  const { estadoResolucionFuente: _estadoInterno, ...vistaPublica } =
    armarEdicionRegistroOficialConsultada(edicion);
  return vistaPublica;
}
