# ADR 0012: Frontera del frontend Next.js como BFF bajo el mismo origen

## Estado

Aceptada

## Contexto

El backend NestJS expone hoy una API JSON con autenticación Bearer (ADR 0005,
ADR 0006). Todavía no existe el repositorio frontend Next.js, pero sí hay que
fijar la frontera antes de escribirlo: la topología elegida determina si el
backend necesita CORS, cómo viaja el token, qué endpoint restaura la sesión y
qué riesgos (CSRF, exfiltración del token por XSS) hay que cubrir.

`packages/infraestructura/src/main.ts` no invoca `app.enableCors()` y no existe
middleware CORS: hoy el navegador no puede llamar al backend desde otro origen.
Esa ausencia era un pendiente sin decidir, no una decisión tomada; ningún ADR
previo documentaba CORS (ADR 0006 documenta rate limiting de `/auth/login` y el
canal de temporización del login, no CORS).

Las dos topologías realmente consideradas fueron:

- **A. Next.js como BFF/reverse proxy bajo el mismo origen**: el navegador solo
  habla con Next.js; Next.js llama a NestJS server-to-server.
- **B. Navegador llamando directamente a NestJS en otro origen**, con allowlist
  CORS explícita.

## Decisión

Se adopta la opción **A: Next.js actuará como BFF/reverse proxy bajo el mismo
origen**. En detalle:

- El **navegador habla únicamente con Next.js**, bajo un único origen. No
  emite peticiones directas a NestJS.
- **Next.js llama a NestJS server-to-server** (Route Handlers o Server
  Actions), nunca desde el bundle del navegador.
- La **URL interna del backend es una variable exclusivamente server-side**
  (p. ej. `API_INTERNAL_URL`). Nunca se expone como `NEXT_PUBLIC_*`, porque
  cualquier `NEXT_PUBLIC_*` termina embebido en el bundle público.
- **Dónde vive el `accessToken`.** El JWT emitido por `POST /auth/login` se
  almacena **directamente en una cookie de sesión `HttpOnly`**, no en un store
  server-side. Hay que distinguir tres cosas que suelen confundirse:
  - **Almacenamiento**: la cookie vive **en el navegador**, que la guarda y la
    reenvía a Next.js en cada petición del mismo origen.
  - **Accesibilidad**: el JavaScript del navegador **no puede leer** el token
    (`HttpOnly`); no está en `localStorage`, `sessionStorage` ni en el bundle.
  - **Consumo**: solo el **código server-side de Next.js** lee esa cookie y
    adjunta `Authorization: Bearer <token>` en sus llamadas server-to-server a
    NestJS.

  No existe sesión persistente server-side, ni Redis, ni PostgreSQL adicional,
  ni identificador opaco de sesión en esta fase: la cookie *es* el portador del
  JWT. Evítese describir esto como que el Bearer "vive solo en el servidor de
  Next.js": sin un store server-side esa frase es incorrecta, porque el token
  sí viaja y reside en el navegador — lo que no ocurre es que JavaScript pueda
  leerlo.
- **Atributos de la cookie.** En producción, preferentemente con el nombre
  `__Host-normativo_session` y cumpliendo: `HttpOnly`, `Secure`,
  `SameSite=Lax` como base, `Path=/` y **sin** atributo `Domain` (requisitos
  del prefijo `__Host-`). En desarrollo local sin HTTPS puede usarse un nombre
  no reservado y una configuración compatible con HTTP local; esa concesión de
  desarrollo **no debe debilitar producción**.
- **Vigencia.** `Max-Age`/`Expires` de la cookie **nunca** puede superar el
  `expiresIn` devuelto por el login ni la expiración real (`exp`) del JWT
  (hoy 1 h, `DURACION_TOKEN_SEGUNDOS_POR_DEFECTO`). Una cookie que sobreviva al
  token solo produciría 401 tardíos.
- Los **Route Handlers/Server Actions adjuntan el Bearer** al llamar al
  backend, leyéndolo de esa cookie exclusivamente en el servidor.
- **`GET /auth/me` es la fuente autoritativa** para restaurar el perfil de la
  sesión (id, nombre, apellido, correo, rol). El frontend no deriva identidad
  ni permisos de ninguna otra fuente.
- **El claim `rol` del JWT no autoriza acciones**, ni en frontend ni en
  backend: es informativo. El backend relee el `Usuario` del repositorio en
  cada caso de uso, y `GET /auth/me` devuelve el rol persistido, no el del
  token.
- Un **401 del backend invalida la sesión del frontend** y conduce al login:
  el BFF **elimina la cookie** y redirige.
- **No hay refresh token, revocación ni logout de servidor** en esta fase
  (coherente con ADR 0006). La sesión vive hasta que expira el token. El
  frontend podrá ofrecer un **logout local** que elimine la cookie; queda
  explícito que eso **no revoca el JWT en el backend**: un token ya emitido
  sigue siendo válido hasta su `exp` si alguien lo hubiera capturado.
- Las **mutaciones a través del BFF deben considerar CSRF** explícitamente:
  `SameSite` en la cookie, comprobación de `Origin`/`Host` en las mutaciones,
  y token anti-CSRF si el flujo lo requiere. Alcance real de `HttpOnly`:
  mitiga la **lectura/exfiltración directa** del token por JavaScript, pero
  **no impide que un XSS emita solicitudes en nombre del usuario** (el
  navegador adjunta la cookie igual) **ni resuelve CSRF**. Son riesgos
  distintos y se cubren con controles distintos.
- **NestJS no habilita CORS** en esta topología, porque ningún navegador cruza
  origen contra él. La ausencia de CORS pasa de pendiente a decisión.
- Las **llamadas directas del navegador a NestJS quedan explícitamente fuera**
  de la arquitectura aprobada.

## Consecuencias

- El backend no requiere cambios de CORS, cabeceras ni configuración para
  soportar el frontend previsto: la superficie CORS es cero.
- El contrato HTTP existente (`POST /auth/login`, formato y duración del JWT)
  no cambia. `GET /auth/me` se agrega sin tocar login.
- El frontend necesita una capa server-side propia (Route Handlers/Server
  Actions) para toda llamada al backend; no puede hacer `fetch` directo desde
  el cliente al dominio del backend.
- Despliegue: frontend y backend deben quedar tras un mismo origen público
  (reverse proxy o equivalente), con la URL del backend accesible solo desde
  la red interna del servidor de Next.js.
- El BFF concentra la responsabilidad de CSRF de las mutaciones; no puede
  asumirse resuelta por el hecho de usar cookies `HttpOnly`.
- Como el JWT viaja **dentro** de la cookie y no hay estado server-side, el
  tamaño del token cuenta contra el límite de la cookie (~4 KB) y la sesión
  del frontend caduca exactamente cuando caduca el JWT: no hay forma de
  extenderla sin re-login mientras no existan refresh tokens.

## Condiciones pendientes antes de exposición pública

- **Rate limiting de `POST /auth/login` sigue siendo obligatorio** antes de
  exponer el servicio públicamente (riesgo ya registrado en ADR 0006). Se
  resolverá **preferentemente en el gateway/WAF de Azure** cuando exista
  infraestructura real, evitando introducir un store distribuido solo para
  esto; la alternativa en aplicación con store compartido queda como plan B.
  Este ADR no lo implementa.

## Fuera de alcance de este bloque

No se implementa el frontend Next.js, CORS, rate limiting, Redis, Azure, ni
cambios en `main.ts`, dependencias, Docker, CI/CD o variables de entorno del
repositorio. Tampoco se agregan refresh tokens, revocación, logout de servidor
ni sesiones persistentes.

## Reversión

Cambiar a la topología B (frontend y backend en orígenes distintos, con el
navegador llamando directamente a NestJS) **requiere un ADR nuevo** y, con él:
allowlist CORS explícita por entorno (nunca `*` combinado con credenciales),
decisión sobre `Access-Control-Allow-Credentials`, tests e2e de preflight
`OPTIONS` y de las cabeceras `Access-Control-Allow-Origin` esperadas.
