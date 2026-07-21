import { EdicionRegistroOficial, EstadoResolucionFuente } from '@normativo/dominio';
import {
  EdicionRegistroOficial as EdicionRegistroOficialPrisma,
  EstadoResolucionFuentePrisma,
} from '@prisma/client';
import { asegurarValorEnum } from './validarEnum';

export function mapearEdicionRegistroOficialDesdePrisma(
  edicion: EdicionRegistroOficialPrisma,
): EdicionRegistroOficial {
  return new EdicionRegistroOficial({
    id: edicion.id,
    tipoPublicacionRegistroOficial: edicion.tipoPublicacionRegistroOficial,
    numeroPublicacionRegistroOficial: edicion.numeroPublicacionRegistroOficial,
    fechaPublicacionOficial: edicion.fechaPublicacionOficial,
    urlPdf: edicion.urlPdf,
    estadoResolucionFuente: asegurarValorEnum(
      edicion.estadoResolucionFuente,
      Object.values(EstadoResolucionFuente),
      {
        entidad: 'EdicionRegistroOficial',
        campo: 'estadoResolucionFuente',
        id: edicion.id,
      },
    ),
  });
}

export function mapearEdicionRegistroOficialADataPrisma(
  edicion: EdicionRegistroOficial,
) {
  return {
    id: edicion.id,
    tipoPublicacionRegistroOficial: edicion.tipoPublicacionRegistroOficial,
    numeroPublicacionRegistroOficial: edicion.numeroPublicacionRegistroOficial,
    fechaPublicacionOficial: edicion.fechaPublicacionOficial,
    urlPdf: edicion.urlPdf,
    estadoResolucionFuente:
      edicion.estadoResolucionFuente as EstadoResolucionFuentePrisma,
  };
}
