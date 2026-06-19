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

Estructura:
```
src/
├── index.ts
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
    ├── politicas/PoliticaAccesoNorma.ts
    └── __tests__/PoliticaAccesoNorma.test.ts
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
