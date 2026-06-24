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
- Todos los usuarios habilitados por una suscripción activa y vigente acceden completamente a todas las normas publicadas editorialmente, sin que el estado jurídico `VIGENTE`, `REFORMADA` o `DEROGADA` bloquee por sí mismo la consulta.
- El correo electrónico identifica globalmente a un usuario. No pueden existir dos usuarios con el mismo correo y un correo no puede estar habilitado en más de una suscripción.
- `Suscripcion` valida únicamente correos duplicados dentro de su propia lista, después de normalizarlos. La unicidad global de usuarios por correo y la pertenencia exclusiva del correo a una suscripción se aplicarán en una fase posterior desde aplicación y persistencia.
- Solo `SUPERADMINISTRADOR` o `ADMINISTRADOR` podrán crear o modificar cuentas/clientes y suscripciones, y definir o modificar `cantidadMaximaUsuarios`. `EDITOR` no podrá realizar esas operaciones.
- Dueño de cuenta y miembros son conceptos internos del cliente/cuenta, no roles administrativos globales. El dueño no puede crear la cuenta inicial, crear la suscripción inicial ni modificar la suscripción. Los miembros no pueden crear ni modificar cuentas/clientes ni suscripciones. Una eventual gestión de miembros por el dueño de cuenta sería una regla separada.
- En la fase 1 no se implementan `Cliente`, `Cuenta`, `Organizacion`, `RolEnCuenta`, invitaciones, cupos dinámicos, estados por miembro ni una política de creación de suscripciones.

#### Modelo de Norma

- `EstadoNorma` representa únicamente estado jurídico: `VIGENTE`, `REFORMADA` o `DEROGADA`. `ARCHIVADA` no existe como estado jurídico.
- `EstadoEditorialNorma` representa el flujo editorial interno: `BORRADOR`, `EN_REVISION` o `PUBLICADA`.
- Una norma se vuelve visible para suscriptores cuando su flujo editorial llega a `PUBLICADA`.
- Una norma no se reforma ni se deroga por voluntad editorial. Reforma y derogatoria requieren sustento normativo; la trazabilidad profunda queda diferida.
- `tipoNorma` e `institucionExpide` son strings obligatorios por ahora.
- `numero` es opcional.
- `fuente` es una URL obligatoria y no es única: un mismo PDF o URL puede contener varias normas.
- `fechaExpedicion` y `fechaPublicacionOficial` son metadata normativa distinta. `fechaPublicacionEnSistema` es una fecha interna del flujo editorial.
- `SUSCRIPTOR` no modifica normas. `EDITOR` y `SUPERADMINISTRADOR` pueden modificar contenido y metadata, pero no inventar reforma o derogatoria sin sustento jurídico.

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
    ├── politicas/PoliticaAccesoNormaSuscriptor.ts
    └── __tests__/
        ├── Norma.test.ts
        └── PoliticaAccesoNormaSuscriptor.test.ts
```

### Aplicación (`packages/aplicacion`)

Paquete TypeScript puro iniciado en la fase 2. Contendrá los casos de uso que orquestan el dominio y los puertos que serán implementados posteriormente por infraestructura.

- Depende de `packages/dominio`.
- No depende de infraestructura.
- En el paso 2.2 contiene únicamente la configuración y el punto de entrada del paquete; todavía no implementa casos de uso ni puertos.

### Infraestructura (futuro `packages/infraestructura`)

Todavía no existe. En fases posteriores contendrá adaptadores concretos como controladores HTTP, repositorios Prisma y clientes Redis.

El modelo de búsqueda futura separará búsqueda pública y búsqueda editorial interna. Algolia será infraestructura futura para la búsqueda pública como índice derivado; la base de datos seguirá siendo la fuente de verdad y el dominio no dependerá de Algolia.

La búsqueda editorial interna será un caso separado, no usará Algolia y se resolverá por un flujo propio de aplicación e infraestructura.

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
