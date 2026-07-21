import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EstadoNorma } from '@normativo/dominio';
import {
  ActualizarNorma,
  CambiarEdicionNorma,
  CambiosActualizarNorma,
  ConsultarContenidoNorma,
  ConsultarNorma,
  ConsultarNormas,
  PublicarNorma,
  PublicarNormas,
  RegistrarNorma,
} from '@normativo/aplicacion';
import { RegistrarNormaHttpDto } from './dto/registrar-norma-http.dto';
import { PublicarNormaHttpDto } from './dto/publicar-norma-http.dto';
import { PublicarNormasHttpDto } from './dto/publicar-normas-http.dto';
import { ActualizarNormaHttpDto } from './dto/actualizar-norma-http.dto';
import { CambiarEdicionNormaHttpDto } from './dto/cambiar-edicion-norma-http.dto';
import { razonAExcepcionHttp } from './mapeo-http';
import { GuardAutenticacion } from '../autenticacion/guard-autenticacion';
import { UsuarioActual } from '../autenticacion/usuario-autenticado.decorator';
import { UsuarioAutenticado } from '../autenticacion/usuario-autenticado';
import { asegurarSoloPropiedadesPermitidas } from './validar-propiedades-http';
import { interpretarFechaCalendarioHttpNullable } from './fecha-calendario-http';

const PROPIEDADES_ACTUALIZAR_NORMA = [
  'tipoNorma',
  'numero',
  'titulo',
  'institucionExpide',
  'fechaExpedicion',
  'estadoJuridico',
  'contenido',
] as const;
const PROPIEDADES_CAMBIAR_EDICION = ['edicionRegistroOficialId'] as const;

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
    private readonly publicarNormas: PublicarNormas,
    private readonly consultarNormas: ConsultarNormas,
    private readonly consultarNorma: ConsultarNorma,
    private readonly actualizarNorma: ActualizarNorma,
    private readonly consultarContenidoNorma: ConsultarContenidoNorma,
    private readonly cambiarEdicion: CambiarEdicionNorma,
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
      estadoJuridico: dto.estadoJuridico as EstadoNorma | undefined,
      fechaExpedicion: interpretarFechaCalendarioHttpNullable(
        dto.fechaExpedicion,
      ),
      fechaPublicacionOficial: interpretarFechaCalendarioHttpNullable(
        dto.fechaPublicacionOficial,
      ),
      tipoPublicacionRegistroOficial: dto.tipoPublicacionRegistroOficial,
      numeroPublicacionRegistroOficial:
        dto.numeroPublicacionRegistroOficial ?? null,
    });

    if (!resultado.exitoso) {
      throw razonAExcepcionHttp(resultado.razon);
    }

    return resultado.norma;
  }

  /**
   * Lista editorial de normas (EDITOR y SUPERADMINISTRADOR). Respuesta: array
   * estándar de normas, sin total embebido ni datos técnicos de ingesta.
   */
  @Get()
  async listar(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Query('estadoEditorial') estadoEditorial?: string,
  ) {
    const resultado = await this.consultarNormas.ejecutar({
      usuarioAutenticadoId: usuario.id,
      estadoEditorial,
    });

    if (!resultado.exitoso) {
      throw razonAExcepcionHttp(resultado.razon);
    }

    return resultado.normas;
  }

  /** Publicación múltiple con resultado por norma (parcial). */
  @Post('publicar')
  @HttpCode(200)
  async publicarVarias(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body() dto: PublicarNormasHttpDto,
  ) {
    const resultado = await this.publicarNormas.ejecutar({
      usuarioAutenticadoId: usuario.id,
      normaIds: dto?.normaIds,
      fechaPublicacionEnSistema: dto?.fechaPublicacionEnSistema
        ? new Date(dto.fechaPublicacionEnSistema)
        : undefined,
    });

    if (!resultado.exitoso) {
      throw razonAExcepcionHttp(resultado.razon);
    }

    return { resultados: resultado.resultados };
  }

  /** Detalle editorial, con `origenRegistroOficial` si nació de ingesta RO. */
  @Get(':id')
  async detalle(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id') normaId: string,
  ) {
    const resultado = await this.consultarNorma.ejecutar({
      usuarioAutenticadoId: usuario.id,
      normaId,
    });

    if (!resultado.exitoso) {
      throw razonAExcepcionHttp(resultado.razon);
    }

    return resultado.norma;
  }

  /** Corrección editorial de una norma en BORRADOR. No publica. */
  @Patch(':id')
  async actualizar(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id') normaId: string,
    @Body() dto: ActualizarNormaHttpDto,
  ) {
    asegurarSoloPropiedadesPermitidas(dto, PROPIEDADES_ACTUALIZAR_NORMA);
    const resultado = await this.actualizarNorma.ejecutar({
      usuarioAutenticadoId: usuario.id,
      normaId,
      cambios: mapearCambiosNorma(dto ?? {}),
    });

    if (!resultado.exitoso) {
      throw razonAExcepcionHttp(resultado.razon);
    }

    return resultado.norma;
  }

  /**
   * Cambiar la edición asociada a una norma. En BORRADOR acepta cualquier
   * edición existente; una norma PUBLICADA solo puede reasociarse a una
   * edición publicable (RESUELTA o MANUAL con urlPdf).
   */
  @Patch(':id/edicion-registro-oficial')
  async cambiarEdicionRegistroOficial(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id') normaId: string,
    @Body() dto: CambiarEdicionNormaHttpDto,
  ) {
    asegurarSoloPropiedadesPermitidas(dto, PROPIEDADES_CAMBIAR_EDICION);
    const resultado = await this.cambiarEdicion.ejecutar({
      usuarioAutenticadoId: usuario.id,
      normaId,
      edicionRegistroOficialId: dto?.edicionRegistroOficialId,
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

/**
 * PATCH parcial: solo las claves presentes en el body cambian. `null` o texto
 * vacío limpian los campos anulables; `fechaExpedicion` viaja como día
 * calendario `YYYY-MM-DD` estricto (sin hora ni offset).
 * La triple de publicación (tipo, número, fecha) pertenece a
 * EdicionRegistroOficial y no es editable aquí. Fuente tampoco lo es.
 */
function mapearCambiosNorma(dto: ActualizarNormaHttpDto): CambiosActualizarNorma {
  const cambios: CambiosActualizarNorma = {};

  if ('tipoNorma' in dto) {
    cambios.tipoNorma = dto.tipoNorma ?? '';
  }
  if ('numero' in dto) {
    cambios.numero = dto.numero ?? null;
  }
  if ('titulo' in dto) {
    cambios.titulo = dto.titulo ?? '';
  }
  if ('institucionExpide' in dto) {
    cambios.institucionExpide = dto.institucionExpide ?? '';
  }
  if ('fechaExpedicion' in dto) {
    cambios.fechaExpedicion = interpretarFechaCalendarioHttpNullable(
      dto.fechaExpedicion,
    );
  }
  if ('estadoJuridico' in dto) {
    cambios.estadoJuridico =
      dto.estadoJuridico === null || dto.estadoJuridico === ''
        ? null
        : (dto.estadoJuridico as EstadoNorma);
  }
  if ('contenido' in dto) {
    cambios.contenido = dto.contenido ?? [];
  }

  return cambios;
}
