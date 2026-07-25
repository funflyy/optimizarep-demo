# Instrucciones del Workspace — ImpactaREP

## ¿Qué es este proyecto?

**Plataforma web SaaS** para la gestión integral de residuos y cumplimiento de la
**Ley REP (Ley 20.920)** de Chile. Permite a empresas registrar productos (POM),
calcular obligaciones, comparar costos entre Sistemas de Gestión, generar
declaraciones SINADER, y simular escenarios de ecodiseño.

Desarrollado por PYBOT SPA. Desplegado en Contabo + Dokploy (self-hosted).

## Estructura del Workspace

```
impactarep/
├── .agents/rules/        → Reglas del agente (contexto, estándares, workflow, arquitectura)
├── .gemini/              → Este archivo de instrucciones
├── docs/                 → Documentación técnica
├── skills/               → Skills curadas para el proyecto
├── src/
│   ├── app/              → Next.js App Router (pages, layouts)
│   ├── components/       → Componentes React reutilizables
│   ├── db/
│   │   ├── schema/       → Schemas Drizzle ORM (una tabla por archivo)
│   │   └── migrations/   → Migraciones generadas por drizzle-kit
│   ├── lib/              → Utilidades compartidas (cn, formatters, constants)
│   ├── server/
│   │   ├── routers/      → tRPC routers (un archivo por dominio)
│   │   └── trpc.ts       → Configuración tRPC + middlewares
│   └── types/            → TypeScript types compartidos
├── tests/                → Tests (Vitest + Playwright)
├── public/               → Assets estáticos
├── Dockerfile            → Imagen de producción
├── docker-compose.yml    → Dev local (app + PostgreSQL)
├── drizzle.config.ts     → Configuración Drizzle ORM
├── tailwind.config.ts    → Configuración Tailwind CSS
└── package.json
```

## Stack tecnológico

- **Next.js 15** (App Router) — Framework full-stack
- **React 19 + TypeScript strict** — Frontend
- **Tailwind CSS 4 + shadcn/ui** — Estilos y componentes
- **tRPC** — API type-safe end-to-end
- **Drizzle ORM** — ORM ligero con migraciones
- **PostgreSQL 16** — Base de datos relacional
- **Clerk** — Autenticación multi-tenant con roles
- **Zod** — Validación de schemas
- **Recharts / D3.js** — Gráficos
- **Docker + Dokploy** — Deploy en Contabo VPS

## Package Manager

**Usar exclusivamente `pnpm`**. No usar `npm` ni `yarn`. Comandos:
- `pnpm install` — instalar dependencias
- `pnpm dev` — levantar dev server
- `pnpm add <pkg>` — agregar dependencia
- `pnpm add -D <pkg>` — agregar dependencia de desarrollo
- `pnpm drizzle-kit generate` — generar migraciones
- `pnpm drizzle-kit push` — aplicar schema a la DB
- `pnpm drizzle-kit studio` — UI de administración de la DB

## Reglas importantes para este workspace

1. **Consulta `.agents/rules/impactarep-project.md`** para contexto completo del proyecto.
2. **Consulta `.agents/rules/coding-standards.md`** antes de escribir código.
3. **Consulta `.agents/rules/workflow.md`** para el flujo de desarrollo.
4. **Consulta `.agents/rules/architecture.md`** para entender la infra y multi-tenancy.
5. **Usa las skills en `./skills/`** — Están curadas para este proyecto.
6. **No hardcodees secrets** — Usa variables de entorno.
7. **Código en inglés, documentación en español** — Código con naming inglés, comentarios y docs en español.
8. **TypeScript strict** — No `any`, no `@ts-ignore` sin justificación.
9. **Tenant isolation obligatoria** — Siempre filtrar por `org_id` en queries.

## Lenguaje del dominio

- **POM**: Productos Puestos en el Mercado (toneladas)
- **Ley REP**: Responsabilidad Extendida del Productor (Ley 20.920)
- **SINADER**: Sistema Nacional de Declaración de Residuos
- **SISREP**: Sistema de Información del REP
- **SMA**: Superintendencia del Medio Ambiente
- **ReSimple / Giro Recicla**: Sistemas de Gestión colectivos
- **UF**: Unidad de Fomento (valor reajustable, Chile)
- **SKU**: Stock Keeping Unit (código de producto)
- **Ecodiseño**: Optimización de envases para reducir impacto REP
