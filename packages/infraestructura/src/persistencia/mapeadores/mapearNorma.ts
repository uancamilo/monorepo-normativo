import {
  EstadoEditorialNorma,
  EstadoNorma,
  Norma,
} from '@normativo/dominio';
import {
  EstadoEditorialNormaPrisma,
  EstadoNormaPrisma,
  Norma as NormaPrisma,
} from '@prisma/client';
import { asegurarValorEnum } from './validarEnum';

export function mapearNormaDesdePrisma(norma: NormaPrisma): Norma {
  return new Norma({
    id: norma.id,
    numero: norma.numero,
    titulo: norma.titulo,
    contenido: norma.contenido,
    tipoNorma: norma.tipoNorma,
    institucionExpide: norma.institucionExpide,
    estadoJuridico:
      norma.estadoJuridico === null
        ? null
        : asegurarValorEnum(
            norma.estadoJuridico,
            Object.values(EstadoNorma),
            { entidad: 'Norma', campo: 'estadoJuridico', id: norma.id },
          ),
    estadoEditorial: asegurarValorEnum(
      norma.estadoEditorial,
      Object.values(EstadoEditorialNorma),
      { entidad: 'Norma', campo: 'estadoEditorial', id: norma.id },
    ),
    fechaExpedicion: norma.fechaExpedicion,
    edicionRegistroOficialId: norma.edicionRegistroOficialId,
    fechaPublicacionEnSistema: norma.fechaPublicacionEnSistema,
  });
}

/**
 * Solo los datos editoriales corregibles: la corrección condicionada nunca
 * escribe estado editorial, edición asociada ni fecha de publicación.
 */
export function mapearDatosEditorialesNormaPrisma(norma: Norma) {
  return {
    numero: norma.numero,
    titulo: norma.titulo,
    contenido: norma.contenido,
    tipoNorma: norma.tipoNorma,
    institucionExpide: norma.institucionExpide,
    estadoJuridico: norma.estadoJuridico as EstadoNormaPrisma | null,
    fechaExpedicion: norma.fechaExpedicion,
  };
}

export function mapearNormaADataPrisma(norma: Norma) {
  return {
    id: norma.id,
    numero: norma.numero,
    titulo: norma.titulo,
    contenido: norma.contenido,
    tipoNorma: norma.tipoNorma,
    institucionExpide: norma.institucionExpide,
    estadoJuridico: norma.estadoJuridico as EstadoNormaPrisma | null,
    estadoEditorial: norma.estadoEditorial as EstadoEditorialNormaPrisma,
    fechaExpedicion: norma.fechaExpedicion,
    edicionRegistroOficialId: norma.edicionRegistroOficialId,
    fechaPublicacionEnSistema: norma.fechaPublicacionEnSistema,
  };
}
