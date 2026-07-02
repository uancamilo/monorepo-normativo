# ADR 0004: Política de códigos HTTP y enumeración de recursos

## Estado

Aceptada (decisión provisional, a revisar con autenticación real)

## Contexto

Los endpoints de normas traducen las razones de fallo de los casos de uso a
códigos HTTP en `packages/infraestructura/src/normas/mapeo-http.ts`:

- `NORMA_NO_ENCONTRADA` → 404
- `ACCESO_DENEGADO` y `SUSCRIPCION_NO_ENCONTRADA` → 403
- `USUARIO_NO_ENCONTRADO` → 401
- `NORMA_YA_PUBLICADA` → 409
- `SOLICITUD_INVALIDA` → 400

La auditoría de Fase 3D observó que distinguir 403 de 404 puede permitir a un
cliente enumerar qué normas existen aunque no tenga acceso a su contenido, y
que 401 para usuario inexistente permite enumerar ids de usuario.

## Decisión

Se mantiene el mapeo actual de forma consciente:

1. **404 para norma inexistente es aceptable.** El producto contempla un
   catálogo de normas público y buscable (la indexación futura en Algolia
   expondrá títulos y metadatos de normas publicadas). La existencia de una
   norma no es información sensible; lo protegido es su **contenido**.
2. **403 genérico para acceso denegado.** `ACCESO_DENEGADO` y
   `SUSCRIPCION_NO_ENCONTRADA` colapsan al mismo código y no revelan la causa
   concreta (rol, suscripción inactiva, correo no habilitado o norma no
   publicada), evitando filtrar el estado de suscripciones ajenas.
3. **401 para `USUARIO_NO_ENCONTRADO` es provisional.** Hoy la identidad llega
   por el header `x-usuario-id`, que es un placeholder inseguro sin
   autenticación real. Cuando se introduzca autenticación (JWT/sesión), la
   verificación de identidad ocurrirá antes del caso de uso y esta razón debe
   reevaluarse (probablemente desaparezca del contrato HTTP).

## Consecuencias

- Los tests e2e siguen afirmando 403 para norma en borrador consultada por
  suscriptor y 404 para norma inexistente.
- La fase de autenticación real debe revisar este ADR, en particular el punto 3
  y la conveniencia de respuestas indistinguibles para identidades inválidas.
- Si el negocio decidiera que la existencia de ciertas normas es sensible,
  habría que colapsar 404/403 para el recurso contenido; hoy no es el caso.
