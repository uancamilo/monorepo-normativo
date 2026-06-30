import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  UnauthorizedException,
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

@Controller('normas')
export class NormasController {
  constructor(
    private readonly registrarNorma: RegistrarNorma,
    private readonly publicarNorma: PublicarNorma,
    private readonly consultarContenidoNorma: ConsultarContenidoNorma,
  ) {}

  @Post()
  async registrar(
    @Headers('x-usuario-id') usuarioId: string | undefined,
    @Body() dto: RegistrarNormaHttpDto,
  ) {
    const usuarioAutenticadoId = this.exigirIdentidad(usuarioId);

    const resultado = await this.registrarNorma.ejecutar({
      usuarioAutenticadoId,
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
    @Headers('x-usuario-id') usuarioId: string | undefined,
    @Param('id') normaId: string,
    @Body() dto: PublicarNormaHttpDto,
  ) {
    const usuarioAutenticadoId = this.exigirIdentidad(usuarioId);

    const resultado = await this.publicarNorma.ejecutar({
      usuarioAutenticadoId,
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
    @Headers('x-usuario-id') usuarioId: string | undefined,
    @Param('id') normaId: string,
  ) {
    const usuarioAutenticadoId = this.exigirIdentidad(usuarioId);

    const resultado = await this.consultarContenidoNorma.ejecutar({
      usuarioAutenticadoId,
      normaId,
    });

    if (!resultado.exitoso) {
      throw razonAExcepcionHttp(resultado.razon);
    }

    return resultado.contenido;
  }

  /**
   * Identidad simulada para Fase 3A; no es autenticación real.
   * El header x-usuario-id es un placeholder temporal e inseguro.
   */
  private exigirIdentidad(usuarioId: string | undefined): string {
    if (typeof usuarioId !== 'string' || usuarioId.trim().length === 0) {
      throw new UnauthorizedException('Falta el header x-usuario-id');
    }
    return usuarioId;
  }
}
