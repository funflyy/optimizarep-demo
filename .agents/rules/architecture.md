---
trigger: always_on
---

# Arquitectura — ImpactaREP

## Diagrama de Infraestructura

```
┌─────────────────────────────────────────────────────────────────┐
│                 VPS                                             │
│            4 vCPU │ 8GB RAM │ 200GB SSD                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ Admin       │  │   Traefik    │  │   Let's Encrypt        │  │
│  │ PaaS UI     │  │  (Reverse    │  │   (SSL automático)     │  │
│  │  :3000      │  │   Proxy)     │  │                        │  │
│  └─────────────┘  │  :80 / :443  │  └────────────────────────┘  │
│                   └──────┬───────┘                              │
│                          │                                      │
│            ┌─────────────┼──────────────┐                       │
│            │             │              │                       │
│  ┌─────────▼────┐ ┌──────▼──────┐ ┌─────▼────────── ┐           │
│  │  Next.js 15  │ │ PostgreSQL  │ │  Volúmenes      │           │
│  │  (App)       │ │  16         │ │  Persistentes   │           │
│  │  :3001       │ │  :5432      │ │  /data/pg       │           │
│  │              │ │             │ │  /data/uploads  │           │
│  │  - App Router│ │  - Schemas  │ │                 │           │
│  │  - tRPC API  │ │  - Indices  │ └─────────────────┘           │
│  │  - Clerk Auth│ │  - Backups  │                               │
│  └──────────────┘ └─────────────┘                               │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Cron Jobs                                               │   │
│  │  - Recordatorios SINADER (8 días hábiles)                │   │
│  │  - Alertas de vencimiento de permisos                    │   │
│  │  - Backup automático de PostgreSQL                       │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

Servicios Externos:
  ├── Clerk (auth + multi-tenancy)      → clerk.com
  ├── Resend (email transaccional)      → resend.com
  ├── Sentry (monitoring de errores)    → sentry.io
  └── GitHub Actions (CI/CD)            → github.com
```

## Multi-tenancy

Modelo: **Row-Level Isolation** — todas las tablas principales tienen `org_id`.

```
Request → Clerk Auth → Middleware extrae org_id → Inyecta en ctx de tRPC
                                                   → Todas las queries filtran por org_id
```

- El middleware de tenant isolation es **obligatorio** en cada procedure.
- Usar `orgProcedure` (middleware customizado) que inyecta `ctx.orgId`.
- Nunca hacer queries sin filtrar por `org_id` (excepto tablas globales como `materials`).

## Flujo de Datos — Declaración SINADER

```
SKUs del cliente (catálogo)
    │
    ▼
POM entries (registros mensuales de ventas por SKU)
    │
    ▼
Motor de cálculo (POM total por material × canal)
    │
    ├── → Comparador de Costos (cruza con tarifas por Sistema de Gestión)
    ├── → Motor de Cumplimiento (cruza con metas por decreto)
    ├── → Simulador de Ecodiseño (recalcula con SKU hipotético)
    │
    ▼
Generador SINADER
    │
    ▼
Excel con formato oficial MMA → Cliente descarga y sube a Ventanilla Única RETC
```

## Flujo de Ecodiseño

```
SKU real (ej: Botella PET 500ml, 25g)
    │
    ▼
Clonar → Crear variante hipotética
    │     (ej: Botella PET 500ml, 18g, 30% reciclado)
    ▼
Motor de Ecodiseño recalcula:
    ├── POM (18g vs 25g = -28% toneladas)
    ├── Obligación REP por materialidad
    ├── Costo por Sistema de Gestión
    └── Indicadores ambientales (CO₂, agua)
    │
    ▼
Comparación lado a lado: Original vs. Ecodiseñado
    │
    ▼
Exportar comparativa a PDF
```

## Seguridad

- **Auth**: Clerk maneja todo (login, SSO, MFA). No almacenamos contraseñas.
- **Tenant isolation**: Enforced a nivel de middleware, no solo de UI.
- **Audit log**: Inmutable. Cada cambio en SKUs, declaraciones y configuración queda registrado.
- **SSL**: Let's Encrypt via Traefik, renovación automática.
- **Backups**: PostgreSQL dump diario, retención 30 días.
- **Headers**: CSP, X-Frame-Options, HSTS configurados en Traefik.
