import { PoliticaAccesoServicio, Suscripcion } from '@normativo/dominio';
import { RepositorioEdicionesRegistroOficial } from '../puertos/RepositorioEdicionesRegistroOficial';
import { RepositorioSuscripciones } from '../puertos/RepositorioSuscripciones';
import { RepositorioUsuarios } from '../puertos/RepositorioUsuarios';
import { PoliticaGestionEditorialNorma } from '../politicas/PoliticaGestionEditorialNorma';
import {
  armarEdicionRegistroOficialConsultada,
  armarEdicionRegistroOficialPublica,
  EdicionRegistroOficialVisible,
} from '../modelos/VistaEdicionRegistroOficial';

export type SolicitudConsultarEdicionesRegistroOficial = {
  usuarioAutenticadoId: string;
  fechaReferencia?: Date;
};

export type RazonConsultarEdicionesRegistroOficialFallido =
  | 'SOLICITUD_INVALIDA'
  | 'USUARIO_NO_ENCONTRADO'
  | 'SUSCRIPCION_NO_ENCONTRADA'
  | 'ACCESO_DENEGADO';

export type ResultadoConsultarEdicionesRegistroOficial =
  | { exitoso: true; ediciones: EdicionRegistroOficialVisible[] }
  | { exitoso: false; razon: RazonConsultarEdicionesRegistroOficialFallido };

export interface DependenciasConsultarEdicionesRegistroOficial {
  repositorioUsuarios: RepositorioUsuarios;
  repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  repositorioSuscripciones: RepositorioSuscripciones;
  politicaGestionEditorial?: PoliticaGestionEditorialNorma;
  politicaAccesoServicio?: PoliticaAccesoServicio;
}

export class ConsultarEdicionesRegistroOficial {
  private readonly repositorioUsuarios: RepositorioUsuarios;
  private readonly repositorioEdiciones: RepositorioEdicionesRegistroOficial;
  private readonly repositorioSuscripciones: RepositorioSuscripciones;
  private readonly politicaGestionEditorial: PoliticaGestionEditorialNorma;
  private readonly politicaAccesoServicio: PoliticaAccesoServicio;

  constructor(
    dependencias: DependenciasConsultarEdicionesRegistroOficial,
  ) {
    this.repositorioUsuarios = dependencias.repositorioUsuarios;
    this.repositorioEdiciones = dependencias.repositorioEdiciones;
    this.repositorioSuscripciones = dependencias.repositorioSuscripciones;
    this.politicaGestionEditorial =
      dependencias.politicaGestionEditorial ??
      new PoliticaGestionEditorialNorma();
    this.politicaAccesoServicio =
      dependencias.politicaAccesoServicio ?? new PoliticaAccesoServicio();
  }

  async ejecutar(
    solicitud: SolicitudConsultarEdicionesRegistroOficial,
  ): Promise<ResultadoConsultarEdicionesRegistroOficial> {
    if (esTextoVacio(solicitud?.usuarioAutenticadoId)) {
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }

    const usuario = await this.repositorioUsuarios.buscarPorId(
      solicitud.usuarioAutenticadoId,
    );
    if (usuario === null) {
      return { exitoso: false, razon: 'USUARIO_NO_ENCONTRADO' };
    }
    let suscripcion: Suscripcion | null = null;
    if (this.politicaAccesoServicio.requiereSuscripcion(usuario)) {
      suscripcion =
        await this.repositorioSuscripciones.buscarPorCorreoHabilitado(
          usuario.obtenerCorreo(),
        );
      if (suscripcion === null) {
        return { exitoso: false, razon: 'SUSCRIPCION_NO_ENCONTRADA' };
      }
    }
    if (
      !this.politicaAccesoServicio.puedeAcceder({
        usuario,
        suscripcion,
        fechaReferencia: solicitud.fechaReferencia,
      })
    ) {
      return { exitoso: false, razon: 'ACCESO_DENEGADO' };
    }

    const ediciones = await this.repositorioEdiciones.listar();
    const tieneVisibilidadEditorial =
      this.politicaGestionEditorial.puedeConsultarEdicionesIncompletasRegistroOficial(
        usuario,
      );
    return {
      exitoso: true,
      ediciones: tieneVisibilidadEditorial
        ? ediciones.map(armarEdicionRegistroOficialConsultada)
        : ediciones
            .filter((edicion) => edicion.tieneFuenteValidaParaPublicacion())
            .map(armarEdicionRegistroOficialPublica),
    };
  }
}

function esTextoVacio(valor: unknown): boolean {
  return typeof valor !== 'string' || valor.trim().length === 0;
}
