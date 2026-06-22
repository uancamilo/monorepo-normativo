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
- Todos los usuarios habilitados por una suscripción activa y vigente acceden completamente a todas las normas publicadas.
- El correo electrónico identifica globalmente a un usuario. No pueden existir dos usuarios con el mismo correo y un correo no puede estar habilitado en más de una suscripción.
- `Suscripcion` valida únicamente correos duplicados dentro de su propia lista, después de normalizarlos. La unicidad global de usuarios por correo y la pertenencia exclusiva del correo a una suscripción se aplicarán en una fase posterior desde aplicación y persistencia.
- Solo `SUPERADMINISTRADOR` o `ADMINISTRADOR` podrán crear cuentas y suscripciones, y definir `cantidadMaximaUsuarios`. `EDITOR` no podrá realizar esas operaciones.
- Dueño de cuenta y miembros son conceptos internos del cliente/cuenta, no roles administrativos globales. No pueden crear la cuenta inicial ni la suscripción inicial.
- En la fase 1 no se implementan `Cliente`, `Cuenta`, `Organizacion`, `RolEnCuenta`, invitaciones, cupos dinámicos, estados por miembro ni una política de creación de suscripciones.

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
    ├── politicas/PoliticaAccesoNormaSuscriptor.ts
    └── __tests__/
        ├── Norma.test.ts
        └── PoliticaAccesoNormaSuscriptor.test.ts
```

### Aplicación (futuro `packages/aplicacion`)

Casos de uso que orquestan el dominio. Define puertos (interfaces) para infraestructura.

### Infraestructura (futuro `packages/infraestructura`)

Adaptadores concretos: controladores HTTP, repositorios Prisma, clientes Redis, etc.

## Decisiones Clave

Ver [decisiones/](./decisiones/) para el registro de decisiones de arquitectura (ADR).

## Tecnologías

| Capa          | Tecnología (fase 1) | Tecnología (prevista) |
|---------------|---------------------|-----------------------|
| Dominio       | TypeScript puro     | —                     |
| Pruebas       | Jest + ts-jest      | —                     |
| Aplicación    | —                   | TypeScript puro       |
| API           | —                   | NestJS                |
| Persistencia  | —                   | Prisma + PostgreSQL   |
| Cache         | —                   | Redis                 |
| Infraestructura| —                  | Azure                 |
