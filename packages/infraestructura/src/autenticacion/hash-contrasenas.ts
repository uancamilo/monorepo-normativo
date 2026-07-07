import {
  GeneradorHashContrasenas,
  VerificadorContrasenas,
} from '@normativo/aplicacion';

/**
 * Wrapper tipado sobre scripts/hash-contrasenas.js, la única fuente de verdad
 * del hashing scrypt (compartida con el seed standalone). Implementa el puerto
 * VerificadorContrasenas de aplicación.
 */

interface ModuloHashContrasenas {
  generarHashContrasena(contrasenaPlano: string): Promise<string>;
  verificarContrasena(
    contrasenaPlano: string,
    hashAlmacenado: string,
  ): Promise<boolean>;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const moduloHashContrasenas: ModuloHashContrasenas = require('../../scripts/hash-contrasenas');

export class ServicioHashContrasenas
  implements VerificadorContrasenas, GeneradorHashContrasenas
{
  generar(contrasenaPlano: string): Promise<string> {
    return moduloHashContrasenas.generarHashContrasena(contrasenaPlano);
  }

  verificar(contrasenaPlano: string, hash: string): Promise<boolean> {
    return moduloHashContrasenas.verificarContrasena(contrasenaPlano, hash);
  }
}
