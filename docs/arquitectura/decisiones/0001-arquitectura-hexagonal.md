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
├── aplicacion/     # (futuro) Casos de uso, puertos
└── infraestructura/ # (futuro) Adaptadores HTTP, BD, Redis
```

### Organización del dominio por módulos de negocio

El paquete `dominio` se organiza por capacidades de negocio, no por tipos técnicos globales (`entidades/`, `enums/`, `politicas/`). Cada módulo funcional contiene sus propias entidades, enums y políticas:

```
packages/dominio/src/
├── usuarios/         # Entidad Usuario, enum RolUsuario
├── suscripciones/    # Entidad Suscripcion, enum EstadoSuscripcion
└── normas/           # Entidad Norma, enum EstadoNorma, política, tests
```

Esta decisión evita el patrón "carpetas por tipo técnico" que genera acoplamiento transversal y dificulta la localización del código relacionado a una capacidad de negocio.

### Reglas de dependencia

1. `dominio` no importa nada de `aplicacion` ni `infraestructura`.
2. `aplicacion` depende solo de `dominio`.
3. `infraestructura` depende de `aplicacion` (puertos) y `dominio` (tipos).
4. Ningún paquete importa frameworks de infraestructura en su código de dominio.

### Acceso a normas

La política `PoliticaAccesoNorma` implementa la regla de acceso para suscriptores:

- El usuario debe tener rol `SUSCRIPTOR`.
- La suscripción debe pertenecer al usuario. Esta validación se delega en `Suscripcion.perteneceAlUsuario(usuario)`, sin que la política compare `usuario.id` contra `suscripcion.usuarioId` directamente.
- La suscripción debe estar activa (estado `ACTIVA` y no vencida por fecha), validado mediante `Suscripcion.estaActiva(fechaReferencia)`.
- La norma debe estar `PUBLICADA`, validado mediante `Norma.estaPublicada()`.

Las políticas de dominio dependen de comportamiento de entidades, no de comparación directa de identificadores primitivos. Los identificadores de las entidades (`Usuario.id`, `Suscripcion.usuarioId`) son privados y solo se accede a ellos mediante métodos de comportamiento (`usuario.tieneId()`, `usuario.obtenerId()`, `suscripcion.perteneceAlUsuario()`). Esta regla se aplica a todas las entidades y políticas del dominio.

El acceso para roles administrativos (`SUPERADMINISTRADOR`, `ADMINISTRADOR`, `EDITOR`) no está implementado en esta política. Deberá resolverse en una fase posterior con permisos explícitos o una política separada.

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
