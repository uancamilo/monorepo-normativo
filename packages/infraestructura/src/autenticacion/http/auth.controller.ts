import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CambiarContrasenaPropia, IniciarSesion } from '@normativo/aplicacion';
import {
  DURACION_TOKEN_SEGUNDOS_POR_DEFECTO,
  ServicioTokens,
} from '../servicio-tokens';
import { GuardAutenticacion } from '../guard-autenticacion';
import { UsuarioActual } from '../usuario-autenticado.decorator';
import { UsuarioAutenticado } from '../usuario-autenticado';
import { LoginHttpDto } from './login-http.dto';
import { CambiarContrasenaHttpDto } from './cambiar-contrasena-http.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly iniciarSesion: IniciarSesion,
    private readonly cambiarContrasenaPropia: CambiarContrasenaPropia,
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

  @Post('cambiar-contrasena')
  @UseGuards(GuardAutenticacion)
  @HttpCode(204)
  async cambiarContrasena(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body() dto: CambiarContrasenaHttpDto,
  ): Promise<void> {
    const resultado = await this.cambiarContrasenaPropia.ejecutar({
      usuarioAutenticadoId: usuario.id,
      contrasenaActual: dto?.contrasenaActual,
      nuevaContrasena: dto?.nuevaContrasena,
    });

    if (!resultado.exitoso) {
      if (resultado.razon === 'CREDENCIALES_INVALIDAS') {
        // 401 genérico: no revela si el usuario existe, si tiene hash o si la
        // contraseña actual es incorrecta.
        throw new UnauthorizedException('CREDENCIALES_INVALIDAS');
      }
      throw new BadRequestException(resultado.razon);
    }

    // 204 No Content: sin hash, sin contraseña, sin token nuevo.
  }
}
