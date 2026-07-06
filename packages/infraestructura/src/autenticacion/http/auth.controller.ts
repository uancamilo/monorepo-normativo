import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { IniciarSesion } from '@normativo/aplicacion';
import {
  DURACION_TOKEN_SEGUNDOS_POR_DEFECTO,
  ServicioTokens,
} from '../servicio-tokens';
import { LoginHttpDto } from './login-http.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly iniciarSesion: IniciarSesion,
    private readonly servicioTokens: ServicioTokens,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginHttpDto) {
    const resultado = await this.iniciarSesion.ejecutar({
      correo: dto?.correo,
      contrasena: dto?.contrasena,
    });

    if (!resultado.exitoso) {
      if (resultado.razon === 'SOLICITUD_INVALIDA') {
        throw new BadRequestException('SOLICITUD_INVALIDA');
      }
      // 401 genérico: no revela si el correo existe ni la causa concreta.
      throw new UnauthorizedException('CREDENCIALES_INVALIDAS');
    }

    const accessToken = await this.servicioTokens.firmar({
      usuarioId: resultado.usuario.id,
      // Rol solo informativo: los permisos salen del Usuario del dominio.
      rol: resultado.usuario.rol,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: DURACION_TOKEN_SEGUNDOS_POR_DEFECTO,
    };
  }
}
