import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CrearUsuarioSistema } from '@normativo/aplicacion';
import { GuardAutenticacion } from '../autenticacion/guard-autenticacion';
import { UsuarioActual } from '../autenticacion/usuario-autenticado.decorator';
import { UsuarioAutenticado } from '../autenticacion/usuario-autenticado';
import { razonAExcepcionHttp } from '../normas/mapeo-http';
import { CrearUsuarioSistemaHttpDto } from './dto/crear-usuario-sistema-http.dto';

/**
 * Gestión mínima de usuarios internos (Fase 4G): solo alta de EDITOR y
 * ADMINISTRADOR por un SUPERADMINISTRADOR. La autorización vive en el caso de
 * uso; el controller solo identifica y delega.
 */
@Controller('usuarios')
@UseGuards(GuardAutenticacion)
export class UsuariosController {
  constructor(private readonly crearUsuarioSistema: CrearUsuarioSistema) {}

  @Post('sistema')
  async crear(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body() dto: CrearUsuarioSistemaHttpDto,
  ) {
    const resultado = await this.crearUsuarioSistema.ejecutar({
      usuarioAutenticadoId: usuario.id,
      nombre: dto?.nombre,
      apellido: dto?.apellido,
      correo: dto?.correo,
      rol: dto?.rol,
      contrasenaInicial: dto?.contrasenaInicial,
    });

    if (!resultado.exitoso) {
      throw razonAExcepcionHttp(resultado.razon);
    }

    // Sin passwordHash, sin contraseña: solo datos públicos del usuario.
    return resultado.usuario;
  }
}
