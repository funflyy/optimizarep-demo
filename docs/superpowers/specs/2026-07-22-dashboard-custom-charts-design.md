# Dashboard Custom Charts — Design Spec

**Date:** 2026-07-22
**Status:** Approved (brainstorming phase complete)
**Owner:** Luis Droguett

## Goal

Let an **admin user** build custom charts for the REP compliance dashboard without
touching code. Charts are saved in Postgres, are visible per organization, and react
to the existing global filters (year + segment).

The hardcoded top section of the dashboard (4 KPI cards + PomOverviewChart + breakdown
table) **stays as is**. The new feature adds a "Widgets configurables" section below.

## Non-goals (YAGNI)

- Drag-and-drop reordering of widgets (use up/down buttons)
- Custom themes per chart
- Export to PDF/PNG
- Cross-tenant dashboards / sharing between specific users
- Scheduled refresh
- Per-org independent chart copies (charts are **shared configs** with visibility control)
- SQL/expression builder — fields are picked from a fixed enum catalog

## Architecture

Three layers, each with one responsibility:

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Persistence      dashboard_charts + dashboard_chart_assignments │
│ 2. Aggregation      lib/aggregate.ts — pure function (config, pieces) → series │
│ 3. Render           DynamicChart registry switches on chartType │
└─────────────────────────────────────────────────────────────────┘
```

The **aggregation engine** is a pure function with a clean input/output contract.
Today it runs in-memory. If the dataset grows past ~500k pieces per org, swap the
function body to call `Prisma.$queryRaw` — the rest of the stack does not change.

## Data model

New file: `src/server/db/schema/dashboard.ts`. Uses Drizzle (matches existing stack).

```ts
export const chartTypeEnum = pgEnum("chart_type", ["bar", "pie", "line", "kpi"]);

export const fieldNameEnum = pgEnum("field_name", [
  "materialClass", "materialDetail", "wasteType",
  "isDomiciliary", "salesYear", "weightGrams", "unitsSold",
]);

export const aggregationEnum = pgEnum("aggregation", ["sum", "avg", "count"]);

export const dashboardCharts = pgTable("dashboard_charts", {
  id:          uuid("id").defaultRandom().primaryKey(),
  name:        varchar("name", { length: 200 }).notNull(),
  chartType:   chartTypeEnum("chart_type").notNull(),
  dimension:   fieldNameEnum("dimension"),                 // null for KPI
  metric:      fieldNameEnum("metric").notNull(),
  aggregation: aggregationEnum("aggregation").notNull(),
  filters:     jsonb("filters").$type<ChartFilters>(),     // optional saved filters
  position:    integer("position").default(0).notNull(),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});

export const dashboardChartAssignments = pgTable(
  "dashboard_chart_assignments",
  {
    chartId:        uuid("chart_id")
                      .references(() => dashboardCharts.id, { onDelete: "cascade" })
                      .notNull(),
    organizationId: uuid("organization_id")
                      .references(() => organizations.id)
                      .notNull(),
    createdAt:      timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.chartId, t.organizationId] })],
);
```

`ChartFilters` (TS type, validated at the API boundary with zod):

```ts
type ChartFilters = {
  materialClass?: string[];     // ["Plástico", "Vidrio"]
  wasteType?:     ("recyclable" | "non_recyclable")[];
  isDomiciliary?: boolean;
};
```

The enum-based `fieldNameEnum` is the security boundary: the wizard only ever
sends values that exist in the enum, never free-form column names. No SQL injection
risk even though aggregation is in-memory.

### Visibility rule

A chart is visible to an organization if:

- The chart has **no rows** in `dashboard_chart_assignments` → global (all orgs see it)
- OR the chart has rows and the current org's id is among them

This means **"por defecto para todos"** = create the chart with an empty assignments
list. The default toggle in the wizard is ON ("visible to all").

## Aggregation engine

`src/lib/aggregate.ts` — pure function, no side effects, no DB.

```ts
export type ChartConfig = {
  id: string;
  chartType: "bar" | "pie" | "line" | "kpi";
  dimension?: FieldName | null;
  metric: FieldName;
  aggregation: "sum" | "avg" | "count";
  filters?: ChartFilters;
};

export type ChartSeries = Array<{ label: string; value: number }>;

export function aggregate(
  config: ChartConfig,
  pieces: readonly Piece[]
): ChartSeries;
```

Behavior:

- Apply `config.filters` first → filtered subset
- If `chartType === "kpi"` → return single-element series with the aggregated metric over the whole subset
- Else → group by `config.dimension`, apply aggregation, return one row per group
- Sort descending by value
- Dimension values are coerced to strings for label display

The function is unit-testable in isolation (no React, no Drizzle).

## Render layer

```
src/app/(app)/dashboard/
  page.tsx                     # server: fetches pieces + visible charts → <DashboardContent>
  dashboard-content.tsx        # client: existing top section + new <CustomSection>
  custom-section.tsx           # NEW: maps visible charts → <DynamicChart>
  dynamic-chart.tsx            # NEW: switches on chartType → renders correct chart
  charts/
    bar-chart.tsx              # NEW: BarChart variant
    pie-chart.tsx              # NEW: PieChart variant
    line-chart.tsx             # NEW: LineChart variant
    kpi-tile.tsx               # NEW: KPI tile variant
  admin/
    page.tsx                   # NEW: list of charts (admin only)
    new/page.tsx               # NEW: wizard
    [id]/edit/page.tsx         # NEW: edit + delete
```

The existing `dashboard-filters.tsx` and `pom-overview-chart.tsx` are not touched.
The new `<CustomSection>` receives the same `filtered` array as the top section,
plus the list of visible `ChartConfig` rows.

## Admin wizard

Route: `/dashboard/admin/new`. Five steps in a single page (no multi-step navigation
in MVP — easier to ship and the form fits on one screen with sections).

| Field | Control | Notes |
|---|---|---|
| Nombre | text input | required |
| Tipo de chart | radio: BAR / PIE / LINE / KPI | required |
| Dimensión | select from catalog (see below) | required unless KPI |
| Métrica | select from catalog | required |
| Agregación | select: SUM / AVG / COUNT | required, drives metric semantics |
| Filtros guardados | optional multiselects | materialClass, wasteType, isDomiciliary |
| Visible para todas las empresas | toggle (default ON) | |
| Si OFF → Asignar a | multiselect of orgs (search by name/RUT) | |

Catalog exposed to the wizard:

```ts
const DIMENSIONS = ["materialClass", "materialDetail", "wasteType", "isDomiciliary", "salesYear"];
const METRICS     = ["weightGrams", "unitsSold", "pieces"];  // "pieces" = COUNT
```

When KPI is selected, the dimension field is hidden.
When LINE is selected, only `salesYear` is offered as dimension (others are time-irrelevant).

Validation lives in zod schemas shared by the API route and the form (single source of truth).

## API surface

tRPC router `src/server/routers/dashboard-charts.ts`:

```ts
dashboardCharts.list          // admin: all; non-admin: visible-to-current-org
dashboardCharts.get           // by id (404 if not visible to current org)
dashboardCharts.create        // admin only
dashboardCharts.update        // admin only
dashboardCharts.delete        // admin only
dashboardCharts.reorder       // admin only — accepts { id, position }[]
dashboardCharts.assign        // admin only — replaces assignment list for one chart
```

All mutations are gated by `users.role === "admin"`. No new role added in this MVP.

## Visibility query

`src/lib/dashboard-charts.ts`:

```ts
export async function getVisibleCharts(orgId: string) {
  return db
    .select({ chart: dashboardCharts, assignedOrgId: dashboardChartAssignments.organizationId })
    .from(dashboardCharts)
    .leftJoin(
      dashboardChartAssignments,
      eq(dashboardChartAssignments.chartId, dashboardCharts.id)
    )
    .where(
      or(
        isNull(dashboardChartAssignments.organizationId),
        eq(dashboardChartAssignments.organizationId, orgId)
      )
    )
    .orderBy(dashboardCharts.position);
}
```

Distinct on chart.id in code (the left join can produce duplicate rows when many
orgs are assigned; we deduplicate with a `Map` after fetching).

## Filter integration

Existing global filters (year, segment) live in `dashboard-content.tsx` and produce
a `filtered` array. The new `<CustomSection>` receives that same array. For each
chart config, aggregation is computed against `filtered` ∩ `config.filters`.

This means a user's year/segment selection affects both the hardcoded top section
and the dynamic bottom section in one click — no duplicated filter state.

## Implementation phases

The plan will split work into 5 phases, each independently shippable behind a
flag if needed:

1. **DB + types** — new schema file, migration, zod schemas
2. **Aggregation engine** — pure function + unit tests
3. **API + visibility query** — tRPC router + per-org filtering applied at the tRPC layer (not Postgres RLS)
4. **Admin wizard + admin list page** — UI for create/edit/delete/reorder/assign
5. **Dashboard integration** — `<CustomSection>` + 4 chart components + registry

## Testing

- Unit: `aggregate()` covers all 4 chart types, all aggregations, dimension coercion, empty input
- Integration: visibility query returns expected charts for global / assigned / draft cases
- Manual: admin creates a chart → appears on their dashboard → assign to one org → other orgs lose it → unassign → returns for all

## Open questions

None at design level. Implementation may surface edge cases (e.g. KPI with no
metric data, line chart with zero years) — handled in the plan.