import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  CambiarContrasenaPropia,
  ConsultarPerfilPropio,
  IniciarSesion,
} from '@normativo/aplicacion';
import {
  DURACION_TOKEN_SEGUNDOS_POR_DEFECTO,
  ServicioTokens,
} from '../servicio-tokens';
import { GuardAutenticacion } from '../guard-autenticacion';
import { UsuarioActual } from '../usuario-autenticado.decorator';
import { UsuarioAutenticado } from '../usuario-autenticado';
import { LoginHttpDto } from './login-http.dto';
import { CambiarContrasenaHttpDto } from './cambiar-contrasena-http.dto';
import { asegurarSoloPropiedadesPermitidas } from '../../normas/validar-propiedades-http';
import { razonAExcepcionHttp } from '../../normas/mapeo-http';

const PROPIEDADES_LOGIN = ['correo', 'contrasena'] as const;
const PROPIEDADES_CAMBIAR_CONTRASENA = [
  'contrasenaActual',
  'nuevaContrasena',
] as const;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly iniciarSesion: IniciarSesion,
    private readonly cambiarContrasenaPropia: CambiarContrasenaPropia,
    private readonly consultarPerfilPropio: ConsultarPerfilPropio,
    private readonly servicioTokens: ServicioTokens,
  ) {}

  /**
   * Perfil de la sesión actual. La identidad sale exclusivamente del `sub` del
   * Bearer verificado: no acepta seleccionar otro usuario por ruta, query ni
   * body. El rol se relee del repositorio, nunca del claim informativo del JWT.
   */
  @Get('me')
  @UseGuards(GuardAutenticacion)
  async perfilPropio(@UsuarioActual() usuario: UsuarioAutenticado) {
    const resultado = await this.consultarPerfilPropio.ejecutar({
      usuarioAutenticadoId: usuario.id,
    });

    if (!resultado.exitoso) {
      // USUARIO_NO_ENCONTRADO -> 401 (token válido pero identidad inexistente),
      // según la política HTTP compartida.
      throw razonAExcepcionHttp(resultado.razon);
    }

    return resultado.perfil;
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginHttpDto) {
    asegurarSoloPropiedadesPermitidas(dto, PROPIEDADES_LOGIN);
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
    asegurarSoloPropiedadesPermitidas(dto, PROPIEDADES_CAMBIAR_CONTRASENA);
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
