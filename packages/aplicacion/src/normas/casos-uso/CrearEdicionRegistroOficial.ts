import {
  EdicionRegistroOficial,
  EstadoResolucionFuente,
} from '@normativo/dominio';
import { RepositorioEdicionesRegistroOficial } from '../puertos/RepositorioEdicionesRegistroOficial';
import { RepositorioUsuarios } from '../puertos/RepositorioUsuarios';
import { PoliticaGestionEditorialNorma } from '../politicas/PoliticaGestionEditorialNorma';
import { GeneradorIds } from '../puertos/GeneradorIds';

export type SolicitudCrearEdicionRegistroOficial = {
  usuarioAutenticadoId: string;
  tipoPublicacionRegistroOficial: string;
  numeroPublicacionRegistroOficial: number;
  fechaPublicacionOficial: Date;
  urlPdf: string;
};

export type RazonCrearEdicionFallido =
  | 'SOLICITUD_INVALIDA'
  | 'USUARIO_NO_ENCONTRADO'
  | 'ACCESO_DENEGADO'
  | 'EDICION_YA_EXISTE'
  | 'URL_INVALIDA';

export type ResultadoCrearEdicionRegistroOficial =
  | {
      exitoso: true;
      edicion: {
        id: string;
        tipoPublicacionRegistroOficial: string;
        numeroPublicacionRegistroOficial: number;
        fechaPublicacionOficial: Date;
        urlPdf: string;
        estadoResolucionFuente: EstadoResolucionFuente;
      };
    }
  | {
      exitoso: false;
      razon: RazonCrearEdicionFallido;
    };

export interface DependenciasCrearEdicionRegistroOficial {
  repositorioUsuarios: RepositorioUsuarios;
  repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  generadorIds: GeneradorIds;
  politicaGestionEditorial?: PoliticaGestionEditorialNorma;
}

/**
 * Creación manual de una edición del Registro Oficial (EDITOR y SUPERADMINISTRADOR).
 * Rechaza duplicados por la misma triple sin sobrescribir la edición existente.
 * Estado inicial: MANUAL.
 */
export class CrearEdicionRegistroOficial {
  private readonly repositorioUsuarios: RepositorioUsuarios;
  private readonly repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  private readonly generadorIds: GeneradorIds;
  private readonly politicaGestionEditorial: PoliticaGestionEditorialNorma;

  constructor(dependencias: DependenciasCrearEdicionRegistroOficial) {
    this.repositorioUsuarios = dependencias.repositorioUsuarios;
    this.repositorioEdiciones = dependencias.repositorioEdiciones;
    this.generadorIds = dependencias.generadorIds;
    this.politicaGestionEditorial =
      dependencias.politicaGestionEditorial ??
      new PoliticaGestionEditorialNorma();
  }

  async ejecutar(
    solicitud: SolicitudCrearEdicionRegistroOficial,
  ): Promise<ResultadoCrearEdicionRegistroOficial> {
    if (!esSolicitudValida(solicitud)) {
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }

    const usuario = await this.repositorioUsuarios.buscarPorId(
      solicitud.usuarioAutenticadoId,
    );
    if (usuario === null) {
      return { exitoso: false, razon: 'USUARIO_NO_ENCONTRADO' };
    }

    if (!this.politicaGestionEditorial.puedeCrearEdiciones(usuario)) {
      return { exitoso: false, razon: 'ACCESO_DENEGADO' };
    }

    // La URL se valida explícitamente en aplicación. Así el contrato público
    // no depende del texto de una excepción del dominio y cualquier otro fallo
    // inesperado del constructor continúa propagándose sin quedar oculto.
    if (!esUrlValida(solicitud.urlPdf)) {
      return { exitoso: false, razon: 'URL_INVALIDA' };
    }

    const edicion = new EdicionRegistroOficial({
      id: this.generadorIds.generar(),
      tipoPublicacionRegistroOficial: solicitud.tipoPublicacionRegistroOficial,
      numeroPublicacionRegistroOficial: solicitud.numeroPublicacionRegistroOficial,
      fechaPublicacionOficial: solicitud.fechaPublicacionOficial,
      urlPdf: solicitud.urlPdf,
      estadoResolucionFuente: EstadoResolucionFuente.MANUAL,
    });

    const persistida = await this.repositorioEdiciones.crearORecuperar(edicion);
    if (!persistida.esNueva) {
      return { exitoso: false, razon: 'EDICION_YA_EXISTE' };
    }

    return {
      exitoso: true,
      edicion: {
        id: persistida.edicion.id,
        tipoPublicacionRegistroOficial:
          persistida.edicion.tipoPublicacionRegistroOficial,
        numeroPublicacionRegistroOficial:
          persistida.edicion.numeroPublicacionRegistroOficial,
        fechaPublicacionOficial: persistida.edicion.fechaPublicacionOficial,
        urlPdf: persistida.edicion.urlPdf ?? '',
        estadoResolucionFuente: persistida.edicion.estadoResolucionFuente,
      },
    };
  }
}

function esSolicitudValida(solicitud: SolicitudCrearEdicionRegistroOficial): boolean {
  if (!solicitud || typeof solicitud !== 'object') {
    return false;
  }
  if (
    esTextoVacio(solicitud.usuarioAutenticadoId) ||
    esTextoVacio(solicitud.tipoPublicacionRegistroOficial) ||
    solicitud.numeroPublicacionRegistroOficial === null ||
    solicitud.numeroPublicacionRegistroOficial === undefined ||
    !solicitud.fechaPublicacionOficial ||
    esTextoVacio(solicitud.urlPdf)
  ) {
    return false;
  }
  // El número no entero positivo es una solicitud inválida, nunca un error de
  // URL: se descarta antes de construir la edición.
  if (
    !Number.isInteger(solicitud.numeroPublicacionRegistroOficial) ||
    solicitud.numeroPublicacionRegistroOficial <= 0
  ) {
    return false;
  }
  if (!esFechaValida(solicitud.fechaPublicacionOficial)) {
    return false;
  }
  return true;
}

function esTextoVacio(valor: unknown): boolean {
  return typeof valor !== 'string' || valor.trim().length === 0;
}

function esUrlValida(valor: string): boolean {
  try {
    new URL(valor.trim());
    return true;
  } catch {
    return false;
  }
}

function esFechaValida(valor: unknown): valor is Date {
  return valor instanceof Date && !Number.isNaN(valor.getTime());
}
