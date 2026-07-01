import { Usuario, RolUsuario } from '@normativo/dominio';
import { Usuario as UsuarioPrisma } from '@prisma/client';

export function mapearUsuarioDesdePrisma(usuario: UsuarioPrisma): Usuario {
  return new Usuario({
    id: usuario.id,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    correo: usuario.correoNormalizado,
    rol: usuario.rol as RolUsuario,
  });
}
