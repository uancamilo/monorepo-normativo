import { RolUsuario, Usuario } from '@normativo/dominio';

/**
 * Autorización de negocio de la ingesta del Registro Oficial: los lotes son
 * control técnico del scraping, así que solo SUPERADMINISTRADOR ingiere y
 * consulta lotes. El flujo editorial (EDITOR y SUPERADMINISTRADOR) trabaja
 * sobre Normas en BORRADOR, no sobre lotes.
 */
export class PoliticaIngestaRegistroOficial {
  puedeIngerirResumenes(usuario: Usuario): boolean {
    return usuario.tieneRol(RolUsuario.SUPERADMINISTRADOR);
  }

  puedeConsultarIngesta(usuario: Usuario): boolean {
    return usuario.tieneRol(RolUsuario.SUPERADMINISTRADOR);
  }

  /**
   * La resolución automática de fuentes es un proceso técnico ejecutable
   * únicamente por SUPERADMINISTRADOR. EDITOR puede publicar una norma
   * cuya edición ya está RESUELTA o MANUAL, pero no ejecuta resolución masiva.
   */
  puedeResolverFuentes(usuario: Usuario): boolean {
    return usuario.tieneRol(RolUsuario.SUPERADMINISTRADOR);
  }
}
