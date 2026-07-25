# Contexto del Proyecto — ImpactaREP

## Descripción

**Plataforma web SaaS** para la gestión integral de residuos, orientada al cumplimiento
de la **Ley REP (Ley 20.920)** y declaraciones en **SISREP** y **SINADER** del Ministerio
del Medio Ambiente de Chile.

Producto llave en mano. Hosteado en infraestructura propia (Contabo + Dokploy).

## Cliente

- **Proyecto**: ImpactaREP
- **Desarrollador**: PYBOT SPA (pybot.cl)
- **Cliente final**: Empresas productoras e importadoras sujetas a la Ley REP

## Stack Tecnológico

| Componente | Tecnología |
|---|---|
| Framework | Next.js 15 (App Router, SSR, API Routes) |
| Frontend | React 19 + TypeScript strict |
| Estilos | Tailwind CSS 4 + shadcn/ui |
| Backend/API | Next.js API Routes + tRPC (type-safe) |
| Base de Datos | PostgreSQL 16 (relacional) |
| ORM | Drizzle ORM (migraciones, type-safe) |
| Autenticación | Clerk (multi-tenant, roles, SSO) |
| Almacenamiento | Volumen persistente en servidor (PDFs, documentos) |
| Email | Resend (transaccional y alertas) |
| Gráficos | Recharts o D3.js |
| Excel/CSV | xlsx + Papa Parse |
| PDF | React-PDF / @react-pdf/renderer |
| Validación | Zod (schemas compartidos) |
| Testing | Vitest (unit) + Playwright (E2E) |
| CI/CD | GitHub Actions |
| Monitoring | Sentry + logs nativos |
| Deploy | Docker → Dokploy (Contabo VPS) |

## Arquitectura de Infraestructura

```
Contabo VPS (4 vCPU, 8GB RAM, 200GB SSD — ~$10-15/mes)
├── Dokploy (PaaS self-hosted)
│   ├── Next.js app (Docker container)
│   ├── PostgreSQL 16 (Docker container, volumen persistente)
│   └── Traefik reverse proxy (SSL automático via Let's Encrypt)
├── Volúmenes persistentes
│   ├── PostgreSQL data
│   └── Archivos subidos (PDFs, Excel, documentos)
└── Backups automáticos (cron → almacenamiento externo)
```

## Módulos Funcionales

1. **Dashboard y Gestión de POM** — SKUs, KPIs, gráficos, carga masiva
2. **Comparador de Costos** — Tarifas por Sistema de Gestión, ahorro en UF/CLP
3. **Generador SISREP/SINADER** — Pre-llenado, Excel oficial MMA, validaciones
4. **Reportería y Documentos** — PDF, indicadores ambientales, repositorio
5. **Integraciones y Seguridad** — Import/export, roles, audit log
6. **Simulador de Ecodiseño** — Escenarios hipotéticos, comparación base vs. ecodiseño

## Modelo de Datos (Esquema Principal)

```
organizations            →  Multi-tenancy, RUTs
├── memberships          →  Relación user ↔ org con rol
├── skus                 →  Catálogo de productos con materialidad
│   ├── sku_versions     →  Historial de cambios por periodo
│   └── pom_entries      →  Registros mensuales de POM por SKU
├── materials            →  Catálogo de materiales (HDPE, PET, vidrio, etc.)
├── management_systems   →  Sistemas de Gestión (ReSimple, Giro Recicla)
│   └── tariffs          →  Tarifas por material × sistema × canal
├── compliance_goals     →  Metas por decreto (anual, por materialidad)
├── compliance_tracking  →  Avance vs. meta
├── sinader_declarations →  Declaraciones generadas (historial)
├── documents            →  Repositorio documental
├── alerts               →  Alertas activas
├── ecodesign_scenarios  →  Escenarios hipotéticos de ecodiseño
│   └── ecodesign_variants →  SKUs modificados
└── audit_log            →  Log inmutable (fiscalización SMA)
```

## Fuera de Alcance

- Agente IA / Chatbot (cotización separada)
- App nativa iOS/Android (se entrega PWA)
- Integración directa con API SINADER (no existe)
- Facturación automática / Stripe

## Glosario del Dominio

- **POM**: Productos Puestos en el Mercado (toneladas)
- **Ley REP**: Ley 20.920 de Responsabilidad Extendida del Productor
- **SINADER**: Sistema Nacional de Declaración de Residuos (MMA)
- **SISREP**: Sistema de Información del REP (MMA)
- **SMA**: Superintendencia del Medio Ambiente (fiscalizador)
- **RETC**: Registro de Emisiones y Transferencias de Contaminantes
- **MMA**: Ministerio del Medio Ambiente de Chile
- **ReSimple**: Sistema de Gestión para envases y embalajes
- **Giro Recicla**: Sistema de Gestión alternativo
- **UF**: Unidad de Fomento (valor reajustable, Chile)
- **SKU**: Stock Keeping Unit (código único de producto)
- **Ecodiseño**: Diseño de envases para reducir impacto ambiental
- **Dom./No dom.**: Canal domiciliario / no domiciliario
- **LER**: Lista Europea de Residuos
