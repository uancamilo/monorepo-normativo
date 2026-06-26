import { RolUsuario, Usuario } from '@normativo/dominio';

const ROLES_QUE_PUBLICAN: ReadonlyArray<RolUsuario> = [
  RolUsuario.SUPERADMINISTRADOR,
  RolUsuario.EDITOR,
];

export class PoliticaGestionEditorialNorma {
  puedePublicarNormas(usuario: Usuario): boolean {
    return ROLES_QUE_PUBLICAN.includes(usuario.obtenerRol());
  }
}
