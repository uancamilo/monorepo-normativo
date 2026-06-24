# ADR 0001: Arquitectura Hexagonal / Clean Architecture

## Estado

Aceptada

## Contexto

El sistema debe evolucionar desde un dominio puro hasta una aplicación completa con API HTTP, persistencia y despliegue en Azure. Se necesita una arquitectura que permita:

- Desarrollar y probar el dominio de forma aislada en la fase 1.
- Conectar infraestructura incrementalmente sin modificar el dominio.
- Cambiar tecnologías de infraestructura sin impacto en la lógica de negocio.

## Decisión

Se adopta Arquitectura Hexagonal (Puertos y Adaptadores) con una interpretación ligera de Clean Architecture.

### Estructura de paquetes

```
packages/
├── dominio/        # Entidades, enums, políticas — sin dependencias externas
├── aplicacion/     # Casos de uso y puertos — paquete iniciado, aún sin implementaciones
└── infraestructura/ # (futuro) Adaptadores HTTP, BD, Redis
```

En el paso 2.2 se inicia `packages/aplicacion` como paquete TypeScript puro. Por ahora contiene únicamente configuración y un punto de entrada vacío: todavía no se implementan casos de uso ni puertos. `packages/infraestructura` aún no existe.

### Organización del dominio por módulos de negocio

El paquete `dominio` se organiza por capacidades de negocio, no por tipos técnicos globales (`entidades/`, `enums/`, `politicas/`). Cada módulo funcional contiene sus propias entidades, enums y políticas:

```
packages/dominio/src/
├── usuarios/         # Entidad Usuario, enum RolUsuario
├── suscripciones/    # Entidad Suscripcion, enum EstadoSuscripcion
└── normas/           # Entidad Norma, enums EstadoNorma y EstadoEditorialNorma, política, tests
```

Esta decisión evita el patrón "carpetas por tipo técnico" que genera acoplamiento transversal y dificulta la localización del código relacionado a una capacidad de negocio.

### Reglas de dependencia

1. `dominio` no importa nada de `aplicacion` ni `infraestructura`.
2. `aplicacion` depende solo de `dominio`.
3. `infraestructura` depende de `aplicacion` (puertos) y `dominio` (tipos).
4. Ningún paquete importa frameworks de infraestructura en su código de dominio.

El paquete `aplicacion` está preparado para contener la orquestación de casos de uso y la definición de puertos. Su única dependencia interna es `dominio`; no depende de infraestructura.

### Modelo de suscripción por cliente/cuenta

- Una suscripción pertenece a un cliente/cuenta, no a un usuario. El cliente/cuenta puede ser una empresa, una organización o una cuenta monousuario.
- En la fase 1, `Suscripcion` conserva únicamente `clienteId`; no se introducen todavía las entidades `Cliente`, `Cuenta` u `Organizacion`.
- La suscripción habilita uno o varios usuarios mediante correos electrónicos normalizados y establece una `cantidadMaximaUsuarios`. El dueño de cuenta consume uno de esos cupos.
- Las normas con flujo editorial `PUBLICADA` pueden aparecer en búsqueda pública y solo pueden consultarse como contenido completo por usuarios autenticados con acceso por suscripción activa y vigente que habilite su correo normalizado.
- El correo electrónico es el identificador global de un usuario. No pueden existir dos usuarios con el mismo correo y un correo no puede estar habilitado en más de una suscripción.
- La entidad `Suscripcion` protege sus invariantes locales: exige al menos un correo, normaliza los correos, rechaza duplicados internos y evita superar `cantidadMaximaUsuarios`.
- La unicidad global del correo de usuario y la exclusividad de un correo entre suscripciones requieren consultar estado externo al agregado. Por ello se implementarán posteriormente en aplicación y persistencia, no dentro de la entidad de dominio de fase 1.
- Solo `SUPERADMINISTRADOR` o `ADMINISTRADOR` podrán crear o modificar cuentas/clientes y suscripciones, además de definir o modificar `cantidadMaximaUsuarios`. `EDITOR` queda excluido de esas capacidades.
- Dueño de cuenta y miembros son conceptos del cliente/cuenta, no roles administrativos globales. El dueño no puede crear la cuenta inicial, crear la suscripción inicial ni modificar la suscripción. Los miembros no pueden crear ni modificar cuentas/clientes ni suscripciones. Una eventual gestión de miembros por el dueño de cuenta sería una regla separada.
- En esta fase no se implementan `Cliente`, `Cuenta`, `Organizacion`, `RolEnCuenta`, invitaciones, cupos dinámicos, estados por miembro ni una política de creación de suscripciones.

### Modelo de Norma

- `EstadoNorma` representa únicamente el estado jurídico: `VIGENTE`, `REFORMADA` o `DEROGADA`. `ARCHIVADA` no existe como estado jurídico.
- `EstadoEditorialNorma` representa el flujo editorial interno: `BORRADOR`, `EN_REVISION` o `PUBLICADA`.
- `Norma.estaVisibleParaSuscriptores()` se mantiene solo como nombre técnico heredado del método existente; la regla de negocio depende de `estadoEditorial = PUBLICADA`.
- Una norma no se reforma ni se deroga por voluntad de un editor o superadministrador. Reforma y derogatoria requieren sustento normativo; la trazabilidad profunda queda diferida.
- `tipoNorma` e `institucionExpide` son strings obligatorios por ahora.
- `numero` es opcional.
- `fuente` es una URL obligatoria y no es única, porque un mismo PDF o URL puede contener varias normas.
- `fechaExpedicion` y `fechaPublicacionOficial` son metadata normativa distinta. `fechaPublicacionEnSistema` es una fecha interna del flujo editorial.
- `SUSCRIPTOR` no modifica normas. `EDITOR` y `SUPERADMINISTRADOR` pueden modificar contenido y metadata, pero no inventar reforma o derogatoria sin sustento jurídico.

### Acceso a normas

La política `PoliticaAccesoNormaSuscriptor` implementa el nombre heredado de la regla de acceso al contenido completo:

- El usuario debe estar autenticado.
- La suscripción debe habilitar el correo del usuario. Esta validación se delega en `Suscripcion.habilitaUsuario(usuario)` y en el comportamiento de comparación normalizada de `Usuario`.
- La suscripción debe estar activa y vigente: estado `ACTIVA`, `fechaInicio` alcanzada y `fechaFin` no alcanzada. Esto se valida mediante `Suscripcion.estaActiva(fechaReferencia)` con el rango temporal `[fechaInicio, fechaFin)`.
- La norma debe estar publicada, validado mediante `Norma.estaVisibleParaSuscriptores()`, nombre técnico heredado que depende de `estadoEditorial = PUBLICADA` y no del estado jurídico.

Las políticas de dominio dependen del comportamiento de las entidades, no de comparaciones primitivas duplicadas. `Usuario` normaliza su correo y expone `tieneCorreo()`; `Suscripcion` delega en ese método desde `habilitaUsuario()`; `Norma` expone su visibilidad editorial mediante `estaVisibleParaSuscriptores()`, nombre técnico heredado. La política de acceso consume esos comportamientos sin conocer cómo se almacenan o normalizan los correos ni cómo se decide la visibilidad interna.

**Separación explícita de acceso por rol:**

- `PoliticaAccesoNormaSuscriptor` y su implementación heredada no deben interpretarse como acceso por rol global `SUSCRIPTOR`.
- `SUPERADMINISTRADOR`, `ADMINISTRADOR` y `EDITOR` no obtienen acceso automático al contenido completo por su rol.
- El acceso al contenido completo depende de autenticación, correo habilitado y suscripción activa y vigente.

### Búsqueda y Algolia

- Algolia se tratará como adaptador de infraestructura para la búsqueda pública.
- La aplicación deberá depender de puertos, no del SDK concreto de Algolia.
- Autocomplete e InstantSearch podrán resolverse directamente en frontend con librerías de Algolia.
- La aplicación/backend no necesita duplicar la experiencia pública como caso de uso tradicional si esa interacción queda resuelta en frontend.
- La sincronización del índice público se realizará por cola/evento, no por llamada bloqueante desde el dominio.
- La búsqueda pública y la consulta privada del contenido completo son casos distintos.
- La búsqueda editorial interna será separada y no usará Algolia.

## Consecuencias

- **Positivas**: el dominio es testeable sin mocks de infraestructura; los adaptadores son intercambiables; la organización modular facilita encontrar código por capacidad de negocio.
- **Negativas**: mayor cantidad de archivos y mapeos entre capas; curva de aprendizaje para nuevos desarrolladores.
- **Mitigación**: mantener el dominio estricto y mínimo; documentar patrones en ADRs.

## Alternativas consideradas

| Alternativa              | Rechazo                                    |
|--------------------------|--------------------------------------------|
| MVC monolítico           | Acopla dominio a framework HTTP            |
| Domain-Driven hexagonal  | Misma decisión, nombre distinto            |
| Sin arquitectura definida| Riesgo de acoplamiento temprano a NestJS   |
| Carpetas por tipo técnico| Dificulta localización y genera acoplamiento transversal |
