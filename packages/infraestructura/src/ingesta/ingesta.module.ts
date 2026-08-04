import { Module } from '@nestjs/common';
import {
  AnalizarIndiceMensualRegistroOficial,
  ConfirmarIngestaIndiceMensualRegistroOficial,
  ConsultarLoteIngestaRegistroOficial,
  ConsultarLotesIngestaRegistroOficial,
  DescargadorPdfIndiceRegistroOficial,
  ExtractorIndiceMensualRegistroOficial,
  GeneradorIds,
  IngerirResumenRegistroOficial,
  RepositorioEdicionesRegistroOficial,
  RepositorioIngestaRegistroOficial,
  RepositorioUsuarios,
} from '@normativo/aplicacion';
import { AutenticacionModule } from '../autenticacion/autenticacion.module';
import { NormasModule } from '../normas/normas.module';
import { IngestaRegistroOficialController } from './ingesta.controller';
import {
  TOKEN_GENERADOR_IDS,
  TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
  TOKEN_REPOSITORIO_USUARIOS,
} from '../normas/tokens';
import {
  TOKEN_DESCARGADOR_PDF_INDICE_REGISTRO_OFICIAL,
  TOKEN_EXTRACTOR_INDICE_MENSUAL_REGISTRO_OFICIAL,
  TOKEN_REPOSITORIO_INGESTA_REGISTRO_OFICIAL,
} from './tokens';
import { obtenerConfiguracionIngesta } from '../configuracion/ingesta';
import { obtenerConfiguracionIndicesRegistroOficial } from '../configuracion/indices-registro-oficial';
import { DescargadorPdfIndiceRegistroOficialHttp } from './indices/descargador-pdf-indice-http';
import { ExtractorIndiceMensualRegistroOficialPdfjs } from './indices/extractor-indice-mensual-adaptador';

/**
 * Ingesta del Registro Oficial en memoria (Fase 5A). Reutiliza las instancias
 * de NormasModule (usuarios, normas, ingesta, generador de ids) para que los
 * borradores creados por ingesta sean visibles en los endpoints de normas y
 * el detalle editorial pueda armar el origen Registro Oficial.
 */
@Module({
  imports: [AutenticacionModule, NormasModule],
  controllers: [IngestaRegistroOficialController],
  providers: [
    {
      provide: IngerirResumenRegistroOficial,
      useFactory: (
        repositorioUsuarios: RepositorioUsuarios,
        repositorioIngesta: RepositorioIngestaRegistroOficial,
        repositorioEdiciones: RepositorioEdicionesRegistroOficial,
        generadorIds: GeneradorIds,
      ) =>
        new IngerirResumenRegistroOficial({
          repositorioUsuarios,
          repositorioIngesta,
          repositorioEdiciones,
          generadorIds,
          limiteMaximoEntradas:
            obtenerConfiguracionIngesta().limiteMaximoEntradas,
        }),
      inject: [
        TOKEN_REPOSITORIO_USUARIOS,
        TOKEN_REPOSITORIO_INGESTA_REGISTRO_OFICIAL,
        TOKEN_REPOSITORIO_EDICIONES_REGISTRO_OFICIAL,
        TOKEN_GENERADOR_IDS,
      ],
    },
    {
      provide: ConsultarLotesIngestaRegistroOficial,
      useFactory: (
        repositorioUsuarios: RepositorioUsuarios,
        repositorioIngesta: RepositorioIngestaRegistroOficial,
      ) =>
        new ConsultarLotesIngestaRegistroOficial({
          repositorioUsuarios,
          repositorioIngesta,
        }),
      inject: [
        TOKEN_REPOSITORIO_USUARIOS,
        TOKEN_REPOSITORIO_INGESTA_REGISTRO_OFICIAL,
      ],
    },
    {
      provide: ConsultarLoteIngestaRegistroOficial,
      useFactory: (
        repositorioUsuarios: RepositorioUsuarios,
        repositorioIngesta: RepositorioIngestaRegistroOficial,
      ) =>
        new ConsultarLoteIngestaRegistroOficial({
          repositorioUsuarios,
          repositorioIngesta,
        }),
      inject: [
        TOKEN_REPOSITORIO_USUARIOS,
        TOKEN_REPOSITORIO_INGESTA_REGISTRO_OFICIAL,
      ],
    },
    // Fase 5D: análisis/confirmación de índices mensuales por URL. Los dos
    // adaptadores técnicos (descarga acotada, extracción) no dependen de la
    // persistencia elegida: son idénticos en IngestaModule (memoria) e
    // IngestaPrismaModule.
    {
      provide: TOKEN_DESCARGADOR_PDF_INDICE_REGISTRO_OFICIAL,
      useFactory: () => {
        const configuracion = obtenerConfiguracionIndicesRegistroOficial();
        return new DescargadorPdfIndiceRegistroOficialHttp({
          timeoutMs: configuracion.timeoutDescargaMs,
        });
      },
    },
    {
      provide: TOKEN_EXTRACTOR_INDICE_MENSUAL_REGISTRO_OFICIAL,
      useClass: ExtractorIndiceMensualRegistroOficialPdfjs,
    },
    {
      provide: AnalizarIndiceMensualRegistroOficial,
      useFactory: (
        repositorioUsuarios: RepositorioUsuarios,
        descargadorPdf: DescargadorPdfIndiceRegistroOficial,
        extractorIndice: ExtractorIndiceMensualRegistroOficial,
      ) =>
        new AnalizarIndiceMensualRegistroOficial({
          repositorioUsuarios,
          descargadorPdf,
          extractorIndice,
        }),
      inject: [
        TOKEN_REPOSITORIO_USUARIOS,
        TOKEN_DESCARGADOR_PDF_INDICE_REGISTRO_OFICIAL,
        TOKEN_EXTRACTOR_INDICE_MENSUAL_REGISTRO_OFICIAL,
      ],
    },
    {
      provide: ConfirmarIngestaIndiceMensualRegistroOficial,
      useFactory: (
        repositorioUsuarios: RepositorioUsuarios,
        descargadorPdf: DescargadorPdfIndiceRegistroOficial,
        extractorIndice: ExtractorIndiceMensualRegistroOficial,
        ingerirResumen: IngerirResumenRegistroOficial,
      ) =>
        new ConfirmarIngestaIndiceMensualRegistroOficial({
          repositorioUsuarios,
          descargadorPdf,
          extractorIndice,
          ingerirResumen,
        }),
      inject: [
        TOKEN_REPOSITORIO_USUARIOS,
        TOKEN_DESCARGADOR_PDF_INDICE_REGISTRO_OFICIAL,
        TOKEN_EXTRACTOR_INDICE_MENSUAL_REGISTRO_OFICIAL,
        // Misma instancia ya registrada arriba: nunca reconstruida.
        IngerirResumenRegistroOficial,
      ],
    },
  ],
})
export class IngestaModule {}
