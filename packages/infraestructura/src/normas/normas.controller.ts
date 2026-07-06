import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { EstadoNorma } from '@normativo/dominio';
import {
  ConsultarContenidoNorma,
  PublicarNorma,
  RegistrarNorma,
} from '@normativo/aplicacion';
import { RegistrarNormaHttpDto } from './dto/registrar-norma-http.dto';
import { PublicarNormaHttpDto } from './dto/publicar-norma-http.dto';
import { razonAExcepcionHttp } from './mapeo-http';
import { GuardAutenticacion } from '../autenticacion/guard-autenticacion';
import { UsuarioActual } from '../autenticacion/usuario-autenticado.decorator';
import { UsuarioAutenticado } from '../autenticacion/usuario-autenticado';

/**
 * Identidad real mínima (Fase 4A): Bearer token verificado por
 * GuardAutenticacion. El token solo identifica (`sub`); los permisos siguen
 * resolviéndose con el Usuario del dominio dentro de los casos de uso.
 */
@Controller('normas')
@UseGuards(GuardAutenticacion)
export class NormasController {
  constructor(
    private readonly registrarNorma: RegistrarNorma,
    private readonly publicarNorma: PublicarNorma,
    private readonly consultarContenidoNorma: ConsultarContenidoNorma,
  ) {}

  @Post()
  async registrar(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body() dto: RegistrarNormaHttpDto,
  ) {
    const resultado = await this.registrarNorma.ejecutar({
      usuarioAutenticadoId: usuario.id,
      numero: dto.numero ?? null,
      titulo: dto.titulo,
      contenido: dto.contenido,
      tipoNorma: dto.tipoNorma,
      institucionExpide: dto.institucionExpide,
      fuente: dto.fuente,
      estadoJuridico: dto.estadoJuridico as EstadoNorma | undefined,
      fechaExpedicion: new Date(dto.fechaExpedicion),
      fechaPublicacionOficial: new Date(dto.fechaPublicacionOficial),
    });

    if (!resultado.exitoso) {
      throw razonAExcepcionHttp(resultado.razon);
    }

    return resultado.norma;
  }

  @Post(':id/publicar')
  @HttpCode(200)
  async publicar(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id') normaId: string,
    @Body() dto: PublicarNormaHttpDto,
  ) {
    const resultado = await this.publicarNorma.ejecutar({
      usuarioAutenticadoId: usuario.id,
      normaId,
      fechaPublicacionEnSistema: dto?.fechaPublicacionEnSistema
        ? new Date(dto.fechaPublicacionEnSistema)
        : undefined,
    });

    if (!resultado.exitoso) {
      throw razonAExcepcionHttp(resultado.razon);
    }

    return resultado.norma;
  }

  @Get(':id/contenido')
  async consultarContenido(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id') normaId: string,
  ) {
    const resultado = await this.consultarContenidoNorma.ejecutar({
      usuarioAutenticadoId: usuario.id,
      normaId,
    });

    if (!resultado.exitoso) {
      throw razonAExcepcionHttp(resultado.razon);
    }

    return resultado.contenido;
  }
}
