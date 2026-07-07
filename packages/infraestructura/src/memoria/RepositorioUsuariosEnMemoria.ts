import { Injectable } from '@nestjs/common';
import { Usuario } from '@normativo/dominio';
import { RepositorioUsuarios } from '@normativo/aplicacion';
import { crearUsuariosSemilla } from './datos-semilla';

@Injectable()
export class RepositorioUsuariosEnMemoria implements RepositorioUsuarios {
  private readonly usuariosPorId = new Map<string, Usuario>();

  constructor() {
    for (const usuario of crearUsuariosSemilla()) {
      this.usuariosPorId.set(usuario.obtenerId(), usuario);
    }
  }

  async buscarPorId(id: string): Promise<Usuario | null> {
    return this.usuariosPorId.get(id) ?? null;
  }

  /** Alta local para usuarios internos creados en runtime (Fase 4G). */
  agregar(usuario: Usuario): void {
    this.usuariosPorId.set(usuario.obtenerId(), usuario);
  }

  async existeCorreo(correoNormalizado: string): Promise<boolean> {
    for (const usuario of this.usuariosPorId.values()) {
      if (usuario.tieneCorreo(correoNormalizado)) {
        return true;
      }
    }
    return false;
  }
}
