import { normalizarCorreo, RolUsuario } from '@normativo/dominio';
import { RepositorioUsuarios } from '../../normas/puertos/RepositorioUsuarios';
import {
  RepositorioUsuariosSistema,
} from '../puertos/RepositorioUsuariosSistema';
import { GeneradorIds } from '../../normas/puertos/GeneradorIds';
import { GeneradorHashContrasenas } from '../puertos/GeneradorHashContrasenas';
import { PoliticaContrasenas } from '../politicas/PoliticaContrasenas';

export type RolUsuarioSistemaPermitido =
  | RolUsuario.EDITOR
  | RolUsuario.ADMINISTRADOR;

const ROLES_PERMITIDOS: ReadonlyArray<RolUsuarioSistemaPermitido> = [
  RolUsuario.EDITOR,
  RolUsuario.ADMINISTRADOR,
];

export type SolicitudCrearUsuarioSistema = {
  usuarioAutenticadoId: string;
  nombre: string;
  apellido: string;
  correo: string;
  rol: string;
  contrasenaInicial: string;
};

export type RazonCrearUsuarioSistemaFallido =
  | 'SOLICITUD_INVALIDA'
  | 'ACCESO_DENEGADO'
  | 'CORREO_YA_REGISTRADO'
  | 'ROL_NO_PERMITIDO'
  | 'CONTRASENA_INVALIDA';

export type ResultadoCrearUsuarioSistema =
  | {
      exitoso: true;
      usuario: {
        id: string;
        nombre: string;
        apellido: string;
        correo: string;
        rol: RolUsuarioSistemaPermitido;
      };
    }
  | {
      exitoso: false;
      razon: RazonCrearUsuarioSistemaFallido;
    };

export interface DependenciasCrearUsuarioSistema {
  repositorioUsuarios: RepositorioUsuarios;
  repositorioUsuariosSistema: RepositorioUsuariosSistema;
  generadorIds: GeneradorIds;
  generadorHashContrasenas: GeneradorHashContrasenas;
  politicaContrasenas?: PoliticaContrasenas;
}

/**
 * Un SUPERADMINISTRADOR autenticado crea usuarios internos del sistema con
 * roles de negocio ya existentes (solo EDITOR y ADMINISTRADOR en esta fase; no
 * crea roles dinámicos, SUSCRIPTOR ni otros SUPERADMINISTRADOR). La contraseña
 * inicial se hashea antes de tocar el puerto de persistencia y nunca se
 * retorna ni se guarda en plano.
 */
export class CrearUsuarioSistema {
  private readonly repositorioUsuarios: RepositorioUsuarios;
  private readonly repositorioUsuariosSistema: RepositorioUsuariosSistema;
  private readonly generadorIds: GeneradorIds;
  private readonly generadorHashContrasenas: GeneradorHashContrasenas;
  private readonly politicaContrasenas: PoliticaContrasenas;

  constructor(dependencias: DependenciasCrearUsuarioSistema) {
    this.repositorioUsuarios = dependencias.repositorioUsuarios;
    this.repositorioUsuariosSistema = dependencias.repositorioUsuariosSistema;
    this.generadorIds = dependencias.generadorIds;
    this.generadorHashContrasenas = dependencias.generadorHashContrasenas;
    this.politicaContrasenas =
      dependencias.politicaContrasenas ?? new PoliticaContrasenas();
  }

  async ejecutar(
    solicitud: SolicitudCrearUsuarioSistema,
  ): Promise<ResultadoCrearUsuarioSistema> {
    if (
      esTextoVacio(solicitud.usuarioAutenticadoId) ||
      esTextoVacio(solicitud.nombre) ||
      esTextoVacio(solicitud.apellido) ||
      esTextoVacio(solicitud.correo) ||
      esTextoVacio(solicitud.rol)
    ) {
      return { exitoso: false, razon: 'SOLICITUD_INVALIDA' };
    }

    const rol = solicitud.rol as RolUsuarioSistemaPermitido;
    if (!ROLES_PERMITIDOS.includes(rol)) {
      return { exitoso: false, razon: 'ROL_NO_PERMITIDO' };
    }

    // Autorización antes que cualquier validación de datos sensibles: un actor
    // no autorizado recibe siempre ACCESO_DENEGADO, sin pistas sobre qué más
    // era válido o inválido en la solicitud.
    const actor = await this.repositorioUsuarios.buscarPorId(
      solicitud.usuarioAutenticadoId,
    );
    if (actor === null || !actor.tieneRol(RolUsuario.SUPERADMINISTRADOR)) {
      return { exitoso: false, razon: 'ACCESO_DENEGADO' };
    }

    if (!this.politicaContrasenas.esValida(solicitud.contrasenaInicial)) {
      return { exitoso: false, razon: 'CONTRASENA_INVALIDA' };
    }

    const correoNormalizado = normalizarCorreo(solicitud.correo);
    if (await this.repositorioUsuariosSistema.existeCorreo(correoNormalizado)) {
      return { exitoso: false, razon: 'CORREO_YA_REGISTRADO' };
    }

    const id = this.generadorIds.generar();
    const nombre = solicitud.nombre.trim();
    const apellido = solicitud.apellido.trim();
    const passwordHash = await this.generadorHashContrasenas.generar(
      solicitud.contrasenaInicial,
    );

    const resultadoCrear = await this.repositorioUsuariosSistema.crear({
      id,
      nombre,
      apellido,
      correoNormalizado,
      rol,
      passwordHash,
    });

    if (!resultadoCrear.exitoso) {
      // Duplicado concurrente detectado por la garantía final de persistencia
      // (la pre-verificación pasó, pero otro proceso creó el correo antes).
      return { exitoso: false, razon: resultadoCrear.razon };
    }

    return {
      exitoso: true,
      usuario: { id, nombre, apellido, correo: correoNormalizado, rol },
    };
  }
}

function esTextoVacio(valor: string): boolean {
  return typeof valor !== 'string' || valor.trim().length === 0;
}
