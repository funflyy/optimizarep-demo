# ImpactaREP — Plan de Acción

## Objetivo

Plataforma web para la gestión de obligaciones REP (Responsabilidad Extendida del Productor) en Chile, enfocada en productores de Envases y Embalajes. Permite registrar productos con sus piezas y materiales, calcular el POM (Puesta en el Mercado), comparar costos entre Sistemas de Gestión Colectivos y generar la declaración SINADER para la Ventanilla Única RETC.

---

## Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 15 (App Router) |
| Frontend | React 19 + TypeScript strict |
| Estilos | Tailwind CSS 4 + shadcn/ui |
| API | tRPC (type-safe end-to-end) |
| ORM | Drizzle ORM |
| Base de Datos | PostgreSQL 16 |
| Autenticación | Clerk (multi-tenant con organizaciones) |
| Gráficos | Recharts |
| Excel | xlsx (importación / exportación) |
| PDF | jsPDF + jspdf-autotable |
| Package Manager | pnpm |

---

## Fase 0: Infraestructura ✅

- [x] Proyecto Next.js 15 + TypeScript + Tailwind CSS 4
- [x] Componentes UI con shadcn/ui (Radix primitives)
- [x] PostgreSQL 16 local + base de datos
- [x] Drizzle ORM configurado con esquema relacional (9 tablas)
- [x] tRPC integrado (server + client + React Query)
- [x] Clerk middleware para protección de rutas
- [x] Providers: ClerkProvider, TRPCProvider, ThemeProvider
- [x] Connection pool optimizado (singleton, max 10 conexiones)
- [x] Seed inicial con datos reales: 158 tarifas (ReSimple + Giro), 15 productos, 42 piezas

### Esquema de Base de Datos

```
products ──┬── product_pieces (1:N, cascade delete)
           └── sales_records (1:N)

management_systems ── tariffs (1:N)

tariff_mappings (material → categoría de tarifa)
```

---

## Fase 1: Frontend Core ✅

### 1.1 Layout y Navegación
- [x] Sidebar colapsable con navegación por módulos
- [x] Header con breadcrumb y toggle dark/light mode
- [x] Navegación SPA (client-side) con estado activo por ruta
- [x] Responsive: sidebar como drawer en mobile, header sticky, padding adaptativo
- [x] Design system: tipografía Inter, paleta emerald, oklch colors

### 1.2 Dashboard (`/dashboard`)
- [x] 4 KPI cards: Nº SKUs, Nº Piezas, Peso Total, Tarifas Cargadas
- [x] Gráfico de barras: distribución POM por material (Recharts)
- [x] Barras de progreso: resumen porcentual por material
- [x] Tabla de desglose por clasificación detallada
- [x] **Filtros interactivos**: año y segmento (Domiciliario / No Domiciliario)
- [x] Badge "Limpiar filtros" cuando hay filtros activos

### 1.3 Gestión de Productos (`/products`)
- [x] Tabla con SKU, nombre, marca, categoría, piezas, peso, ventas
- [x] Filas expandibles → desglose de piezas (material, peso, tipo residuo)
- [x] Stats cards: Total SKUs, Total Piezas, Con Ventas Registradas
- [x] Búsqueda por SKU o nombre + filtro por categoría
- [x] Formulario de creación con piezas dinámicas (`/products/new`)
- [x] Importación masiva desde Excel con preview y validación (`/products/import`)
- [x] Exportación a Excel (descarga directa .xlsx)
- [x] tRPC router completo: list, getById, create, update, delete

### 1.4 Gestión de Tarifas (`/tariffs`)
- [x] Vista por Sistema de Gestión (tabs: Chilerecicla, COREIGN, Giro, ProREP, ReSimple)
- [x] Tabla de tarifas: segmento, material, subcategoría, UF/Ton
- [x] Links a tarifas oficiales por SIG
- [x] Catálogo de SIGs con cards de estadísticas (`/tariffs/systems`)
- [x] Mapeo automático de materiales → categorías de tarifa (`/tariffs/mappings`)

### 1.5 Comparador de Costos (`/comparator`)
- [x] Tabla comparativa: Subcategoría × SIG → UF/Ton, highlight del más bajo
- [x] Badge de diferencia porcentual entre SIGs
- [x] Separación por segmento Domiciliario / No Domiciliario
- [x] Gráfico de barras agrupado comparativo (Recharts)
- [x] 3 KPIs: SIGs comparados, subcategorías, ahorro promedio potencial

### 1.6 Reportes (`/reports`)
- [x] Exportación Excel SINADER (3 hojas: Productos, Piezas, POM por Material)
- [x] Exportación BBDD completa (compatible con formato de importación)
- [x] Generación de Reporte PDF ejecutivo (4 páginas: resumen, productos, piezas, POM)
- [x] Resumen de datos incluidos con contadores

---

## Fase 2: Lógica de Negocio 🔜

- [ ] Motor de cálculo de costos REP
- [ ] Cálculo automático de costos por pieza según mapeo de tarifas
- [ ] Proyección de línea base (banda de proyección por año)
- [ ] Desglose domiciliario / no domiciliario por costo
- [ ] Conversión UF ↔ CLP (valor UF configurable o vía API Banco Central)
- [ ] Vista de simulación: ¿qué pasa si cambio de SIG?

---

## Fase 3: Autenticación y Multi-tenancy

- [ ] Configuración de Clerk con claves de producción
- [ ] Webhook: sincronización Clerk → tabla `users` en PostgreSQL
- [ ] Roles: administrador, analista, visualizador
- [ ] Middleware `orgProcedure` en tRPC (aislamiento por `org_id`)
- [ ] Flujo de onboarding para nueva organización
- [ ] Todas las queries filtradas por `org_id`

---

## Fase 4: Deploy a Producción

- [ ] Dockerfile de producción (multi-stage build)
- [ ] docker-compose con PostgreSQL y app
- [ ] Deploy en VPS con proxy reverso (Traefik)
- [ ] Dominio + SSL automático (Let's Encrypt)
- [ ] Variables de entorno de producción
- [ ] Backup automático de PostgreSQL (cron diario)
- [ ] CI/CD: GitHub Actions → build → deploy

---

## Modelo de Datos Clave

### Producto → Piezas (1:N)

Cada producto (SKU) tiene N piezas. Cada pieza declara:
- Material general (Plástico, Metal, Celulosa, etc.)
- Material detallado (PET, HDPE, Aluminio, Cartón corrugado, etc.)
- Peso en gramos
- Segmento: Domiciliario / No Domiciliario
- Tipo de residuo: Reciclable / No Reciclable

### Registros de Ventas

- Unidades vendidas por año y segmento
- Permite calcular POM real (peso × ventas)

### Tarifas

- Cada SIG publica tarifas en UF/Tonelada
- Agrupadas por segmento y subcategoría de material
- Se mapean a los materiales de las piezas para calcular costos

---

## Flujo de Declaración SINADER

```
1. Registrar productos con piezas y materiales
2. Cargar ventas por período
3. Motor calcula POM por material × segmento
4. Comparar costos entre Sistemas de Gestión
5. Generar Excel SINADER (formato oficial MMA)
6. Cliente descarga y sube a Ventanilla Única RETC
```

---

## Notas

- Los datos de productos se mantienen bajo acuerdo de confidencialidad
- El sistema está diseñado para flexibilizar la información de productos y el sistema de gestión al cual se acoja cada empresa
- La homologación de tarifas entre SIGs la realiza el usuario por UI (mapeo manual de materiales → categorías)
- Los campos custom de productos se almacenan como JSONB para máxima flexibilidad
