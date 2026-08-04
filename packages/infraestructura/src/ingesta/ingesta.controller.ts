import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  AnalizarIndiceMensualRegistroOficial,
  ConfirmarIngestaIndiceMensualRegistroOficial,
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
import { AnalizarIndiceHttpDto } from './dto/analizar-indice-http.dto';
import { ConfirmarIngestaIndiceHttpDto } from './dto/confirmar-ingesta-indice-http.dto';

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
    private readonly analizarIndice: AnalizarIndiceMensualRegistroOficial,
    private readonly confirmarIngestaIndice: ConfirmarIngestaIndiceMensualRegistroOficial,
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

  /**
   * Analiza un índice mensual a partir de una URL directa del PDF oficial
   * (Fase 5D): no escribe absolutamente nada en repositorios de ingesta,
   * normas o ediciones. Devuelve la previsualización completa (todas las
   * entradas, sin muestreo) para revisión antes de `/indices/confirmar`.
   */
  @Post('indices/analizar')
  @HttpCode(HttpStatus.OK)
  async analizarIndiceMensual(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body() dto: AnalizarIndiceHttpDto,
  ) {
    validarContratoAnalizarIndice(dto);
    const resultado = await this.analizarIndice.ejecutar({
      usuarioAutenticadoId: usuario.id,
      urlPdf: dto?.urlPdf,
      periodoEsperado: dto?.periodoEsperado,
    });

    if (!resultado.exitoso) {
      throw razonAExcepcionHttp(resultado.razon);
    }

    return {
      analisis: resultado.analisis,
      entradasDetectadas: resultado.entradasDetectadas,
    };
  }

  /**
   * Confirma la ingesta de un índice mensual ya revisado con `/indices/analizar`
   * (Fase 5D): vuelve a descargar y a extraer desde cero, exige coincidencia
   * exacta de versión (antes de descargar) y de SHA-256 (antes de extraer),
   * y delega íntegramente en `IngerirResumenRegistroOficial`. Nunca resuelve
   * fuentes ni publica normas.
   */
  @Post('indices/confirmar')
  async confirmarIngestaIndiceMensual(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body() dto: ConfirmarIngestaIndiceHttpDto,
  ) {
    validarContratoConfirmarIngestaIndice(dto);
    const resultado = await this.confirmarIngestaIndice.ejecutar({
      usuarioAutenticadoId: usuario.id,
      urlPdf: dto?.urlPdf,
      periodoEsperado: dto?.periodoEsperado,
      sha256PdfObservado: dto?.sha256PdfObservado,
      versionExtractorObservada: dto?.versionExtractorObservada,
    });

    if (!resultado.exitoso) {
      throw razonAExcepcionHttp(resultado.razon);
    }

    return {
      lote: resultado.lote,
      creado: resultado.creado,
      sha256Pdf: resultado.sha256Pdf,
      versionExtractor: resultado.versionExtractor,
    };
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

const PROPIEDADES_ANALIZAR_INDICE = ['urlPdf', 'periodoEsperado'] as const;
const PROPIEDADES_CONFIRMAR_INGESTA_INDICE = [
  'urlPdf',
  'periodoEsperado',
  'sha256PdfObservado',
  'versionExtractorObservada',
] as const;

function validarContratoAnalizarIndice(dto: unknown): void {
  asegurarSoloPropiedadesPermitidas(dto, PROPIEDADES_ANALIZAR_INDICE);
  asegurarSoloPropiedadesPermitidas(dto.periodoEsperado, PROPIEDADES_PERIODO);
}

function validarContratoConfirmarIngestaIndice(dto: unknown): void {
  asegurarSoloPropiedadesPermitidas(dto, PROPIEDADES_CONFIRMAR_INGESTA_INDICE);
  asegurarSoloPropiedadesPermitidas(dto.periodoEsperado, PROPIEDADES_PERIODO);
}
