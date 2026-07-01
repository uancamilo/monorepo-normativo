# Visión de Arquitectura

## Propósito del Sistema

Plataforma de contenido normativo por suscripción que permite a usuarios acceder a normas jurídicas y documentos regulatorios bajo un modelo de acceso controlado.

## Principios Arquitectónicos

- **Dominio aislado**: la lógica de negocio no depende de frameworks, bases de datos ni protocolos de transporte.
- **Puertos y adaptadores**: las capas externas (HTTP, persistencia, mensajería) se conectan al dominio mediante interfaces (puertos).
- **Modularidad por capacidades de negocio**: el dominio se organiza en módulos que representan áreas funcionales (usuarios, suscripciones, normas), no en carpetas técnicas globales (entidades/, enums/, politicas/). Cada módulo contiene sus propias entidades, enums y políticas.
- **Encapsulamiento del estado interno**: las entidades exponen comportamiento, no propiedades primitivas. Las políticas de dominio delegan en métodos de las entidades en lugar de comparar identificadores directamente.
- **Lenguaje ubicuo en español**: todas las entidades, enums y políticas usan terminología del dominio normativo.

## Capas del Sistema

```
[Infraestructura] → [Aplicación] → [Dominio]
     (adaptadores)     (casos de uso)   (entidades, políticas)
```

### Dominio (`packages/dominio`)

Contiene entidades, enums y políticas de negocio organizados por módulo funcional. No tiene dependencias externas.

#### Modelo de suscripción por cliente/cuenta

- Una suscripción pertenece a un cliente/cuenta, no a un usuario individual. El cliente/cuenta puede corresponder a una empresa, una organización o una cuenta monousuario.
- En esta fase, `Suscripcion` representa la relación mediante `clienteId`; todavía no se implementan las entidades `Cliente`, `Cuenta` u `Organizacion`.
- Una suscripción habilita uno o varios usuarios por correo electrónico y define `cantidadMaximaUsuarios`. El dueño de cuenta está incluido en esa cantidad máxima.
- Las normas con flujo editorial `PUBLICADA` pueden aparecer en búsqueda pública y solo pueden consultarse como contenido completo por usuarios autenticados con acceso por suscripción activa y vigente que habilite su correo normalizado.
- El correo electrónico identifica globalmente a un usuario. No pueden existir dos usuarios con el mismo correo y un correo no puede estar habilitado en más de una suscripción.
- `Suscripcion` valida únicamente correos duplicados dentro de su propia lista, después de normalizarlos. La unicidad global de usuarios por correo y la pertenencia exclusiva del correo a una suscripción se aplicarán en una fase posterior desde aplicación y persistencia.
- Cuando exista Prisma/PostgreSQL, `usuarios.correo_normalizado` y `suscripcion_correos_habilitados.correo_normalizado` deben tener constraints `UNIQUE` desde el primer schema. Esto evita que puertos como `RepositorioSuscripciones.buscarPorCorreoHabilitado(correo)` tengan resultados ambiguos.
- Solo `SUPERADMINISTRADOR` o `ADMINISTRADOR` podrán crear o modificar cuentas/clientes y suscripciones, y definir o modificar `cantidadMaximaUsuarios`. `EDITOR` no podrá realizar esas operaciones.
- Dueño de cuenta y miembros son conceptos internos del cliente/cuenta, no roles administrativos globales. El dueño no puede crear la cuenta inicial, crear la suscripción inicial ni modificar la suscripción. Los miembros no pueden crear ni modificar cuentas/clientes ni suscripciones. Una eventual gestión de miembros por el dueño de cuenta sería una regla separada.
- En la fase 1 no se implementan `Cliente`, `Cuenta`, `Organizacion`, `RolEnCuenta`, invitaciones, cupos dinámicos, estados por miembro ni una política de creación de suscripciones.

#### Modelo de Norma

- `EstadoNorma` representa únicamente estado jurídico: `VIGENTE`, `REFORMADA` o `DEROGADA`. `ARCHIVADA` no existe como estado jurídico.
- `EstadoEditorialNorma` representa el flujo editorial interno: `BORRADOR`, `EN_REVISION` o `PUBLICADA`.
- `Norma.estaVisibleParaSuscriptores()` se mantiene solo como nombre técnico heredado del método existente; la regla de negocio depende de `estadoEditorial = PUBLICADA`.
- Una norma no se reforma ni se deroga por voluntad editorial. Reforma y derogatoria requieren sustento normativo; la trazabilidad profunda queda diferida.
- `tipoNorma` e `institucionExpide` son strings obligatorios por ahora.
- `numero` es opcional.
- `fuente` es una URL obligatoria y no es única: un mismo PDF o URL puede contener varias normas.
- `fechaExpedicion` y `fechaPublicacionOficial` son metadata normativa distinta. `fechaPublicacionEnSistema` es una fecha interna del flujo editorial.
- `SUSCRIPTOR` no modifica normas. `EDITOR` y `SUPERADMINISTRADOR` pueden modificar contenido y metadata, pero no inventar reforma o derogatoria sin sustento jurídico.
- La política canónica actual para decidir el acceso al contenido completo de una norma es `PoliticaAccesoContenidoNorma`.
- `PoliticaAccesoNormaSuscriptor` queda como política heredada (`@deprecated`) que conserva la semántica basada en el rol global `SUSCRIPTOR`; debe usarse solo para compatibilidad y delega en `PoliticaAccesoContenidoNorma`.
- Una norma puede pasar a `PUBLICADA` con metadata aprobada aunque todavía no tenga contenido completo. `Norma` permite `contenido` libre sin validar no vacío para soportar el poblamiento inicial descrito en la sección de pipeline de ingesta normativa.

Estructura:
```
src/
├── index.ts
├── compartido/
│   └── validaciones/
│       ├── texto.ts
│       └── __tests__/
│           └── texto.test.ts
├── usuarios/
│   ├── entidades/Usuario.ts
│   ├── enums/RolUsuario.ts
│   └── __tests__/Usuario.test.ts
├── suscripciones/
│   ├── entidades/Suscripcion.ts
│   ├── enums/EstadoSuscripcion.ts
│   └── __tests__/Suscripcion.test.ts
└── normas/
    ├── entidades/Norma.ts
    ├── enums/EstadoNorma.ts
    ├── enums/EstadoEditorialNorma.ts
    ├── politicas/
    │   ├── PoliticaAccesoContenidoNorma.ts
    │   └── PoliticaAccesoNormaSuscriptor.ts
    └── __tests__/
        ├── Norma.test.ts
        ├── PoliticaAccesoContenidoNorma.test.ts
        └── PoliticaAccesoNormaSuscriptor.test.ts
```

### Aplicación (`packages/aplicacion`)

Paquete TypeScript puro iniciado en la fase 2. Contiene los casos de uso que orquestan el dominio y los puertos que serán implementados posteriormente por infraestructura.

- Depende de `packages/dominio`.
- No depende de infraestructura.
- Define al menos los puertos de repositorio `RepositorioUsuarios`, `RepositorioNormas` y `RepositorioSuscripciones`, además del puerto `GeneradorIds`.
- Incluye los casos de uso `RegistrarNorma`, `PublicarNorma` y `ConsultarContenidoNorma`, que cierran el flujo mínimo de aplicación `RegistrarNorma -> PublicarNorma -> ConsultarContenidoNorma`.
- Implementa el caso de uso `ConsultarContenidoNorma`, que orquesta esos puertos y la política de dominio `PoliticaAccesoContenidoNorma`.
- La metadata interna/editorial como `fechaPublicacionEnSistema` queda fuera de la consulta de contenido del suscriptor (`ConsultarContenidoNorma` no la devuelve). Si se necesita exponerla, requerirá un caso de uso editorial separado en el futuro (por ejemplo `ConsultarNormaEditorial`); `PublicarNorma`, como acción editorial, sí puede devolverla.
- Implementa el caso de uso `PublicarNorma`, que orquesta `RepositorioUsuarios`, `RepositorioNormas`, la política de aplicación `PoliticaGestionEditorialNorma` y el puerto `PublicadorEventosNormas`.
- Implementa el caso de uso `RegistrarNorma`, que registra una norma inicial en estado editorial `BORRADOR`. Orquesta `RepositorioUsuarios`, `RepositorioNormas`, la política de aplicación `PoliticaGestionEditorialNorma` y el puerto `GeneradorIds`. `RegistrarNorma` usa `GeneradorIds` como puerto para evitar acoplar la aplicación a infraestructura (`crypto`, UUID o base de datos). Registrar no publica la norma, no emite evento y no sincroniza el índice público.
- La sincronización futura del índice público (Algolia) queda detrás del puerto de aplicación `PublicadorEventosNormas`: `PublicarNorma` emite un evento al publicar una norma. No existe adaptador real de Algolia ni SDK de Algolia en este hito.
- `PublicadorEventosNormas` no implica una llamada directa a Algolia. En infraestructura real, el adaptador debe usar outbox transaccional o un mecanismo equivalente con garantía transaccional para que la publicación de la norma no quede acoplada al estado operativo de Algolia.

### Infraestructura (`packages/infraestructura`)

Paquete iniciado en la Fase 3A. Contiene una primera capa HTTP con NestJS mínimo que expone el flujo de aplicación `RegistrarNorma -> PublicarNorma -> ConsultarContenidoNorma`. En Fase 3B incorpora persistencia Prisma/PostgreSQL como adaptadores de infraestructura para los puertos de aplicación.

- Depende de `packages/aplicacion` y `packages/dominio`. Dominio y aplicación no dependen de infraestructura.
- Los casos de uso se componen por inyección de dependencias de NestJS recibiendo implementaciones de puertos; la aplicación no conoce NestJS.
- La identidad se simula con el header HTTP `x-usuario-id`. Es un placeholder temporal e inseguro de la Fase 3A; **no es autenticación real**. Si falta, los endpoints responden `401`.
- Endpoints: `POST /normas` (registrar), `POST /normas/:id/publicar` (publicar), `GET /normas/:id/contenido` (consultar). Las razones de fallo de los casos de uso se traducen a códigos HTTP en infraestructura (`mapeo-http`), no en aplicación.
- Los adaptadores en memoria siguen disponibles para pruebas e2e y arranque local simple (`PERSISTENCIA=memoria`, valor por defecto): `RepositorioUsuariosEnMemoria`, `RepositorioNormasEnMemoria`, `RepositorioSuscripcionesEnMemoria`, `GeneradorIdsSecuencial`, `PublicadorEventosNormasEnMemoria`.
- Los adaptadores Prisma se activan con `PERSISTENCIA=prisma`: `RepositorioUsuariosPrisma`, `RepositorioNormasPrisma`, `RepositorioSuscripcionesPrisma`, `GeneradorIdsUuid` y `PublicadorEventosNormasPrisma`.
- Prisma/PostgreSQL impone `UNIQUE` para `usuarios.correo_normalizado` y `suscripcion_correos_habilitados.correo_normalizado` desde el schema inicial. La aplicación podrá traducir errores de constraint a errores de negocio, pero la garantía fuerte vive en la base de datos.
- `PublicadorEventosNormasPrisma` persiste eventos en `eventos_normas_publicadas`. Esta tabla es almacenamiento simple del evento emitido; no es todavía outbox transaccional completo porque `PublicarNorma` aún guarda la norma y luego publica el evento como dos pasos separados.
- La Fase 3C consolida la persistencia: agrega un seed idempotente de desarrollo/test (`scripts/seed-prisma.js`, reutilizado por el e2e Prisma), scripts npm (`prisma:seed`, `test:prisma`, etc.) y un e2e HTTP contra Prisma/PostgreSQL. Los tests Prisma se saltan si no hay `TEST_DATABASE_URL`, de modo que `npm test` general sigue verde sin PostgreSQL. El flujo local está documentado en `docs/desarrollo/prisma-postgresql-local.md`.
- Ni la Fase 3B ni la 3C implementan Redis, colas, scraping, Algolia, frontend, autenticación real ni outbox transaccional completo.

El modelo de búsqueda futura separará búsqueda pública y búsqueda editorial interna. Algolia será infraestructura futura para la búsqueda pública como índice derivado; la base de datos seguirá siendo la fuente de verdad y el dominio no dependerá de Algolia.

Autocomplete e InstantSearch podrán implementarse directamente en frontend con librerías de Algolia. Por eso, la aplicación/backend no necesita duplicar la experiencia pública como un caso de uso tradicional si esa interacción queda resuelta en frontend.

La aplicación/backend sí debe controlar la publicación, actualización y retiro de normas del índice público mediante eventos, cola o un mecanismo equivalente futuro. Para efectos externos reintentables, como sincronizar Algolia, el mecanismo previsto es outbox transaccional: persistir la norma y el evento pendiente en la misma transacción, y entregar el evento después mediante infraestructura observable y con reintentos. El índice público no debe exponer el contenido completo como atributo recuperable.

La búsqueda editorial interna será un caso separado, no usará Algolia y se resolverá por un flujo propio de aplicación e infraestructura.

### Pipeline de ingesta normativa (Fase 1)

La Fase 1 del pipeline puebla la base de datos a partir del resumen mensual del Registro Oficial:

- El resumen mensual es un PDF que contiene títulos, metadata y referencias a la publicación oficial de cada norma, pero no el texto completo.
- El scraping del resumen mensual crea registros iniciales de normas y detecta la fuente oficial específica (Registro Oficial, suplemento, edición especial u otra publicación oficial) de cada una. La `fuente` de la norma es esa fuente oficial detectada y no es única.
- Los registros iniciales se crean en estado editorial `BORRADOR`.
- Una norma puede publicarse con metadata aprobada aunque todavía no tenga contenido completo.
- Si una norma publicada no tiene contenido completo, el detalle muestra el PDF de la fuente oficial detectada incrustado; el sistema no inventa contenido.
- Las normas se sincronizan automáticamente con Algolia al pasar a `PUBLICADA`, y la búsqueda pública opera sobre metadata.
- El scraping es una función crítica restringida inicialmente al `SUPERADMINISTRADOR`; un `EDITOR` solo puede ejecutarlo si el `SUPERADMINISTRADOR` lo habilita globalmente.
- El detalle de las reglas de esta fase está documentado en `docs/reglas-negocio.md`, sección 13.

## Decisiones Clave

Ver [decisiones/](./decisiones/) para el registro de decisiones de arquitectura (ADR).

## Tecnologías

| Capa          | Tecnología (fase 2) | Tecnología (prevista) |
|---------------|---------------------|-----------------------|
| Dominio       | TypeScript puro     | —                     |
| Pruebas       | Jest + ts-jest      | —                     |
| Aplicación    | TypeScript puro     | —                     |
| API           | —                   | NestJS                |
| Persistencia  | —                   | Prisma + PostgreSQL   |
| Cache         | —                   | Redis                 |
| Infraestructura| —                  | Azure                 |
