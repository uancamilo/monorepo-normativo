import { RolUsuario, Usuario } from '@normativo/dominio';

const ROLES_EDITORIALES: ReadonlyArray<RolUsuario> = [
  RolUsuario.SUPERADMINISTRADOR,
  RolUsuario.EDITOR,
];

/**
 * Autorización del flujo editorial: EDITOR y SUPERADMINISTRADOR trabajan con
 * normas (consultar, registrar, corregir, publicar). ADMINISTRADOR y
 * SUSCRIPTOR no participan del flujo editorial.
 */
export class PoliticaGestionEditorialNorma {
  puedePublicarNormas(usuario: Usuario): boolean {
    return ROLES_EDITORIALES.includes(usuario.obtenerRol());
  }

  puedeRegistrarNormas(usuario: Usuario): boolean {
    return ROLES_EDITORIALES.includes(usuario.obtenerRol());
  }

  puedeConsultarNormasEditorialmente(usuario: Usuario): boolean {
    return ROLES_EDITORIALES.includes(usuario.obtenerRol());
  }

  puedeActualizarNormas(usuario: Usuario): boolean {
    return ROLES_EDITORIALES.includes(usuario.obtenerRol());
  }

  puedeConsultarEdicionesRegistroOficial(usuario: Usuario): boolean {
    return ROLES_EDITORIALES.includes(usuario.obtenerRol());
  }

  /**
   * Corrección manual de la fuente (urlPdf) de una edición del Registro
   * Oficial. Es trabajo editorial: aplica a todas las normas de la edición.
   */
  puedeCorregirFuenteEdiciones(usuario: Usuario): boolean {
    return ROLES_EDITORIALES.includes(usuario.obtenerRol());
  }

  /**
   * Creación manual de una edición del Registro Oficial. Solo EDITOR y
   * SUPERADMINISTRADOR pueden crear ediciones manualmente.
   */
  puedeCrearEdiciones(usuario: Usuario): boolean {
    return ROLES_EDITORIALES.includes(usuario.obtenerRol());
  }
}
