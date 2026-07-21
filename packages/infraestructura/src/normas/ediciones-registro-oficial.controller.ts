import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ActualizarFuenteEdicionRegistroOficial,
  ConsultarDetalleEdicionRegistroOficial,
  ConsultarEdicionesRegistroOficial,
  CrearEdicionRegistroOficial,
  ResolverFuenteRegistroOficial,
} from '@normativo/aplicacion';
import { EstadoResolucionFuente } from '@normativo/dominio';
import { ActualizarFuenteEdicionHttpDto } from './dto/actualizar-fuente-edicion-http.dto';
import { CrearEdicionRegistroOficialHttpDto } from './dto/crear-edicion-registro-oficial-http.dto';
import { razonAExcepcionHttp } from './mapeo-http';
import { GuardAutenticacion } from '../autenticacion/guard-autenticacion';
import { UsuarioActual } from '../autenticacion/usuario-autenticado.decorator';
import { UsuarioAutenticado } from '../autenticacion/usuario-autenticado';
import { asegurarSoloPropiedadesPermitidas } from './validar-propiedades-http';
import { interpretarFechaCalendarioHttp } from './fecha-calendario-http';

const PROPIEDADES_CREAR_EDICION = [
  'tipoPublicacionRegistroOficial',
  'numeroPublicacionRegistroOficial',
  'fechaPublicacionOficial',
  'urlPdf',
] as const;
const PROPIEDADES_ACTUALIZAR_FUENTE = ['urlPdf'] as const;

/**
 * Catálogo y gestión de ediciones del Registro Oficial. La fuente (urlPdf)
 * pertenece a la edición: corregirla aquí la actualiza para todas las normas
 * asociadas. EDITOR y SUPERADMINISTRADOR pueden crear, consultar y corregir.
 * ADMINISTRADOR y SUSCRIPTOR no tienen acceso (no enrutado para ellos).
 */
@Controller('ediciones-registro-oficial')
@UseGuards(GuardAutenticacion)
export class EdicionesRegistroOficialController {
  constructor(
    private readonly actualizarFuenteEdicion: ActualizarFuenteEdicionRegistroOficial,
    private readonly crearEdicion: CrearEdicionRegistroOficial,
    private readonly resolverFuente: ResolverFuenteRegistroOficial,
    private readonly consultarEdiciones: ConsultarEdicionesRegistroOficial,
    private readonly consultarDetalleEdicion: ConsultarDetalleEdicionRegistroOficial,
  ) {}

  @Get()
  async listar(@UsuarioActual() usuario: UsuarioAutenticado) {
    const resultado = await this.consultarEdiciones.ejecutar({
      usuarioAutenticadoId: usuario.id,
    });
    if (!resultado.exitoso) {
      throw razonAExcepcionHttp(resultado.razon);
    }
    return resultado.ediciones;
  }

  @Get(':id')
  async detalle(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id') edicionId: string,
  ) {
    const resultado = await this.consultarDetalleEdicion.ejecutar({
      usuarioAutenticadoId: usuario.id,
      edicionId,
    });
    if (!resultado.exitoso) {
      throw razonAExcepcionHttp(resultado.razon);
    }
    return resultado.edicion;
  }

  @Post()
  @HttpCode(201)
  async crear(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body() dto: CrearEdicionRegistroOficialHttpDto,
  ) {
    asegurarSoloPropiedadesPermitidas(dto, PROPIEDADES_CREAR_EDICION);
    const resultado = await this.crearEdicion.ejecutar({
      usuarioAutenticadoId: usuario.id,
      tipoPublicacionRegistroOficial: dto.tipoPublicacionRegistroOficial,
      numeroPublicacionRegistroOficial: dto.numeroPublicacionRegistroOficial,
      fechaPublicacionOficial: interpretarFechaCalendarioHttp(
        dto.fechaPublicacionOficial,
      ),
      urlPdf: dto.urlPdf,
    });

    if (!resultado.exitoso) {
      throw razonAExcepcionHttp(resultado.razon);
    }

    return resultado.edicion;
  }

  @Patch(':id/fuente')
  async actualizarFuente(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id') edicionId: string,
    @Body() dto: ActualizarFuenteEdicionHttpDto,
  ) {
    asegurarSoloPropiedadesPermitidas(dto, PROPIEDADES_ACTUALIZAR_FUENTE);
    const resultado = await this.actualizarFuenteEdicion.ejecutar({
      usuarioAutenticadoId: usuario.id,
      edicionId,
      urlPdf: dto?.urlPdf,
    });

    if (!resultado.exitoso) {
      throw razonAExcepcionHttp(resultado.razon);
    }

    return resultado.edicion;
  }

  @Post('resolver-pendientes')
  @HttpCode(200)
  async resolverPendientes(@UsuarioActual() usuario: UsuarioAutenticado) {
    const resultado = await this.resolverFuente.ejecutar({
      usuarioAutenticadoId: usuario.id,
    });

    if (!resultado.exitoso) {
      throw razonAExcepcionHttp(resultado.razon);
    }

    // Transformar resultados a resumen
    const resumen = {
      procesadas: resultado.resultados.length,
      resueltas: resultado.resultados.filter(
        (r) =>
          r.procesada &&
          r.estadoResolucionFuente === EstadoResolucionFuente.RESUELTA,
      ).length,
      noEncontradas: resultado.resultados.filter(
        (r) =>
          r.procesada &&
          r.estadoResolucionFuente === EstadoResolucionFuente.NO_ENCONTRADA,
      ).length,
      conflictivas: resultado.resultados.filter(
        (r) =>
          r.procesada &&
          r.estadoResolucionFuente === EstadoResolucionFuente.CONFLICTIVA,
      ).length,
      omitidas: resultado.resultados.filter((r) => !r.procesada).length,
    };

    return resumen;
  }
}
