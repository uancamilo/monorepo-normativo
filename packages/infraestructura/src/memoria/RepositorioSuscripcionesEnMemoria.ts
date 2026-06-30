import { Injectable } from '@nestjs/common';
import { Suscripcion, Usuario, RolUsuario } from '@normativo/dominio';
import { RepositorioSuscripciones } from '@normativo/aplicacion';
import { crearSuscripcionesSemilla } from './datos-semilla';

@Injectable()
export class RepositorioSuscripcionesEnMemoria
  implements RepositorioSuscripciones
{
  private readonly suscripciones: Suscripcion[];

  constructor() {
    this.suscripciones = crearSuscripcionesSemilla();
  }

  async buscarPorCorreoHabilitado(correo: string): Promise<Suscripcion | null> {
    // Reutiliza la comparación normalizada de dominio (Suscripcion.habilitaUsuario
    // delega en Usuario.tieneCorreo) para no duplicar la normalización del correo.
    const usuarioReferencia = new Usuario({
      id: 'referencia-busqueda',
      nombre: 'Referencia',
      apellido: 'Busqueda',
      correo,
      rol: RolUsuario.SUSCRIPTOR,
    });

    return (
      this.suscripciones.find((suscripcion) =>
        suscripcion.habilitaUsuario(usuarioReferencia),
      ) ?? null
    );
  }
}
