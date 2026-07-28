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
import { ResolverPendientesHttpDto } from './dto/resolver-pendientes-http.dto';
import { razonAExcepcionHttp } from './mapeo-http';
import { GuardAutenticacion } from '../autenticacion/guard-autenticacion';
import { UsuarioActual } from '../autenticacion/usuario-autenticado.decorator';
import { UsuarioAutenticado } from '../autenticacion/usuario-autenticado';
import { asegurarSoloPropiedadesPermitidas } from './validar-propiedades-http';
import { interpretarFechaCalendarioHttp } from './fecha-calendario-http';

/**
 * Razones de fallo del catálogo expuestas en el resumen agregado. Siempre se
 * reportan las cuatro claves (aunque valgan cero): no todos los fallos son
 * transitorios y la operación necesita distinguirlos sin detalles internos.
 */
const RAZONES_ERROR_CATALOGO = [
  'CATALOGO_TEMPORALMENTE_NO_DISPONIBLE',
  'RESPUESTA_CATALOGO_INVALIDA',
  'COBERTURA_CATALOGO_NO_DISPONIBLE',
  'BUSQUEDA_CATALOGO_INCOMPLETA',
] as const;

const PROPIEDADES_CREAR_EDICION = [
  'tipoPublicacionRegistroOficial',
  'numeroPublicacionRegistroOficial',
  'fechaPublicacionOficial',
  'urlPdf',
] as const;
const PROPIEDADES_ACTUALIZAR_FUENTE = ['urlPdf'] as const;
const PROPIEDADES_RESOLVER_PENDIENTES = ['edicionIds', 'limite'] as const;

/**
 * Catálogo y gestión de ediciones del Registro Oficial. La fuente (urlPdf)
 * pertenece a la edición: corregirla aquí la actualiza para todas las normas
 * asociadas. EDITOR y SUPERADMINISTRADOR pueden crear, consultar y corregir,
 * y ven el catálogo editorial completo. ADMINISTRADOR consulta sin
 * suscripción solo ediciones completas; SUSCRIPTOR obtiene esa misma vista si
 * cumple la autorización contractual. Estas reglas se deciden en aplicación.
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
  async resolverPendientes(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body() dto: ResolverPendientesHttpDto | undefined,
  ) {
    const cuerpo = dto ?? {};
    asegurarSoloPropiedadesPermitidas(cuerpo, PROPIEDADES_RESOLVER_PENDIENTES);

    const resultado = await this.resolverFuente.ejecutar({
      usuarioAutenticadoId: usuario.id,
      edicionIds: cuerpo.edicionIds as string[] | undefined,
      limite: cuerpo.limite as number | undefined,
    });

    if (!resultado.exitoso) {
      throw razonAExcepcionHttp(resultado.razon);
    }

    const procesadas = resultado.resultados;
    const cuentaPorEstado = (estado: EstadoResolucionFuente) =>
      procesadas.filter(
        (r) => r.procesada && r.estadoResolucionFuente === estado,
      ).length;
    const cuentaPorRazon = (razon: string) =>
      procesadas.filter((r) => !r.procesada && r.razon === razon).length;

    // Los fallos del catálogo se cuentan aparte, discriminados por su razón
    // real, y nunca se ocultan como NO_ENCONTRADA ni como omitidas de negocio.
    const erroresPorRazon = Object.fromEntries(
      RAZONES_ERROR_CATALOGO.map((razon) => [razon, cuentaPorRazon(razon)]),
    ) as Record<(typeof RAZONES_ERROR_CATALOGO)[number], number>;

    return {
      procesadas: procesadas.length,
      resueltas: cuentaPorEstado(EstadoResolucionFuente.RESUELTA),
      noEncontradas: cuentaPorEstado(EstadoResolucionFuente.NO_ENCONTRADA),
      conflictivas: cuentaPorEstado(EstadoResolucionFuente.CONFLICTIVA),
      omitidas:
        cuentaPorRazon('FUENTE_YA_ESTABLECIDA') +
        cuentaPorRazon('EDICION_NO_ENCONTRADA'),
      erroresCatalogo: Object.values(erroresPorRazon).reduce(
        (suma, cuenta) => suma + cuenta,
        0,
      ),
      erroresPorRazon,
    };
  }
}
