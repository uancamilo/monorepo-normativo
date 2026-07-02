import { Usuario, RolUsuario } from '@normativo/dominio';
import { Usuario as UsuarioPrisma } from '@prisma/client';
import { asegurarValorEnum } from './validarEnum';

export function mapearUsuarioDesdePrisma(usuario: UsuarioPrisma): Usuario {
  return new Usuario({
    id: usuario.id,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    correo: usuario.correoNormalizado,
    rol: asegurarValorEnum(usuario.rol, Object.values(RolUsuario), {
      entidad: 'Usuario',
      campo: 'rol',
      id: usuario.id,
    }),
  });
}
