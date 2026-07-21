import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ConsultarLoteIngestaRegistroOficial,
  ConsultarLotesIngestaRegistroOficial,
  EntradaDetectadaResumen,
  IngerirResumenRegistroOficial,
} from '@normativo/aplicacion';
import { GuardAutenticacion } from '../autenticacion/guard-autenticacion';
import { UsuarioActual } from '../autenticacion/usuario-autenticado.decorator';
import { UsuarioAutenticado } from '../autenticacion/usuario-autenticado';
import { razonAExcepcionHttp } from '../normas/mapeo-http';
import { asegurarSoloPropiedadesPermitidas } from '../normas/validar-propiedades-http';
import { IngerirResumenHttpDto } from './dto/ingerir-resumen-http.dto';

/**
 * Ingesta por lote del resumen mensual del Registro Oficial (Fase 5A).
 * El controller solo identifica (Bearer) y delega: la autorización de negocio
 * (solo SUPERADMINISTRADOR ingiere y consulta lotes; el flujo editorial vive
 * en /normas) está en los casos de uso de aplicación.
 */
@Controller('ingesta/registro-oficial')
@UseGuards(GuardAutenticacion)
export class IngestaRegistroOficialController {
  constructor(
    private readonly ingerirResumen: IngerirResumenRegistroOficial,
    private readonly consultarLotes: ConsultarLotesIngestaRegistroOficial,
    private readonly consultarLote: ConsultarLoteIngestaRegistroOficial,
  ) {}

  @Post('resumenes')
  async ingerir(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body() dto: IngerirResumenHttpDto,
  ) {
    validarContratoIngesta(dto);
    const resultado = await this.ingerirResumen.ejecutar({
      usuarioAutenticadoId: usuario.id,
      periodo: dto?.periodo,
      urlResumenMensualRegistroOficial:
        dto?.urlResumenMensualRegistroOficial,
      versionExtractor: dto?.versionExtractor,
      entradasDetectadas:
        dto?.entradasDetectadas as EntradaDetectadaResumen[],
    });

    if (!resultado.exitoso) {
      throw razonAExcepcionHttp(resultado.razon);
    }

    return {
      lote: resultado.lote,
      creado: resultado.creado,
    };
  }

  @Get('lotes')
  async listarLotes(@UsuarioActual() usuario: UsuarioAutenticado) {
    const resultado = await this.consultarLotes.ejecutar({
      usuarioAutenticadoId: usuario.id,
    });

    if (!resultado.exitoso) {
      throw razonAExcepcionHttp(resultado.razon);
    }

    return resultado.lotes;
  }

  @Get('lotes/:id')
  async obtenerLote(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id') loteId: string,
  ) {
    const resultado = await this.consultarLote.ejecutar({
      usuarioAutenticadoId: usuario.id,
      loteId,
    });

    if (!resultado.exitoso) {
      throw razonAExcepcionHttp(resultado.razon);
    }

    return resultado.lote;
  }
}

const PROPIEDADES_LOTE = [
  'periodo',
  'urlResumenMensualRegistroOficial',
  'versionExtractor',
  'entradasDetectadas',
] as const;
const PROPIEDADES_PERIODO = ['anio', 'mes'] as const;
const PROPIEDADES_ENTRADA = [
  'posicion',
  'tipo',
  'numero',
  'titulo',
  'institucion',
  'seccion',
  'publicacion',
  'segmentoCrudo',
  'metadataExtraccion',
  'advertencias',
  'confianza',
] as const;
const PROPIEDADES_PUBLICACION = ['tipo', 'numero', 'fecha'] as const;

function validarContratoIngesta(dto: unknown): void {
  asegurarSoloPropiedadesPermitidas(dto, PROPIEDADES_LOTE);
  asegurarSoloPropiedadesPermitidas(dto.periodo, PROPIEDADES_PERIODO);
  if (!Array.isArray(dto.entradasDetectadas)) {
    return;
  }
  for (const entrada of dto.entradasDetectadas) {
    asegurarSoloPropiedadesPermitidas(entrada, PROPIEDADES_ENTRADA);
    if (entrada.publicacion !== null) {
      asegurarSoloPropiedadesPermitidas(
        entrada.publicacion,
        PROPIEDADES_PUBLICACION,
      );
    }
  }
}
