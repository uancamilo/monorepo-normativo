import { RolUsuario, Usuario } from '@normativo/dominio';

const ROLES_EDITORIALES: ReadonlyArray<RolUsuario> = [
  RolUsuario.SUPERADMINISTRADOR,
  RolUsuario.EDITOR,
];

export class PoliticaGestionEditorialNorma {
  puedePublicarNormas(usuario: Usuario): boolean {
    return ROLES_EDITORIALES.includes(usuario.obtenerRol());
  }

  puedeRegistrarNormas(usuario: Usuario): boolean {
    return ROLES_EDITORIALES.includes(usuario.obtenerRol());
  }
}
