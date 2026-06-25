import { Suscripcion } from '@normativo/dominio';

export interface RepositorioSuscripciones {
  buscarPorCorreoHabilitado(correo: string): Promise<Suscripcion | null>;
}
