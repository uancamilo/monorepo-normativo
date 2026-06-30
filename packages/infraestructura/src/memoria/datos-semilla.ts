import {
  EstadoSuscripcion,
  RolUsuario,
  Suscripcion,
  Usuario,
} from '@normativo/dominio';

/**
 * Datos semilla en memoria para Fase 3A.
 * Solo para pruebas e2e y arranque local; no es persistencia real.
 */
export function crearUsuariosSemilla(): Usuario[] {
  return [
    new Usuario({
      id: 'usuario-editor-1',
      nombre: 'Editor',
      apellido: 'Uno',
      correo: 'editor@test.com',
      rol: RolUsuario.EDITOR,
    }),
    new Usuario({
      id: 'usuario-superadmin-1',
      nombre: 'Superadmin',
      apellido: 'Uno',
      correo: 'superadmin@test.com',
      rol: RolUsuario.SUPERADMINISTRADOR,
    }),
    new Usuario({
      id: 'usuario-admin-1',
      nombre: 'Admin',
      apellido: 'Uno',
      correo: 'admin@test.com',
      rol: RolUsuario.ADMINISTRADOR,
    }),
    new Usuario({
      id: 'usuario-suscriptor-1',
      nombre: 'Suscriptor',
      apellido: 'Uno',
      correo: 'suscriptor@test.com',
      rol: RolUsuario.SUSCRIPTOR,
    }),
  ];
}

export function crearSuscripcionesSemilla(): Suscripcion[] {
  return [
    new Suscripcion({
      id: 'suscripcion-activa-1',
      clienteId: 'cliente-1',
      correosUsuariosHabilitados: ['suscriptor@test.com'],
      cantidadMaximaUsuarios: 1,
      estado: EstadoSuscripcion.ACTIVA,
      fechaInicio: new Date('2000-01-01T00:00:00.000Z'),
      fechaFin: new Date('2100-01-01T00:00:00.000Z'),
    }),
  ];
}
