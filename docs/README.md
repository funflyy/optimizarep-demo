# ImpactaREP — Plataforma de Gestión de Residuos & Ley REP

## Descripción

Plataforma web SaaS para la gestión integral de residuos, orientada al cumplimiento de la Ley REP (Ley 20.920) y declaraciones SISREP/SINADER del MMA de Chile.

## Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 15 (App Router, SSR, API Routes) |
| Frontend | React 19 + TypeScript strict |
| Estilos | Tailwind CSS 4 + shadcn/ui |
| Backend/API | tRPC (type-safe end-to-end) |
| Base de Datos | PostgreSQL 16 |
| ORM | Drizzle ORM |
| Auth | Clerk (multi-tenant, roles) |
| Deploy | Docker → Dokploy (Contabo VPS) |

## Módulos

1. **Dashboard y Gestión de POM** — SKUs, KPIs, gráficos, carga masiva
2. **Comparador de Costos** — Tarifas por Sistema de Gestión
3. **Generador SISREP/SINADER** — Declaraciones oficiales
4. **Reportería y Documentos** — PDF, indicadores ambientales
5. **Integraciones y Seguridad** — Import/export, roles, audit log
6. **Simulador de Ecodiseño** — Escenarios hipotéticos de envases