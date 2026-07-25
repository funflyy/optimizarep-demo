# Dashboard Custom Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin build custom charts for the REP dashboard that persist in Postgres, react to global filters, and are scoped per organization (default: visible to all).

**Architecture:** Three layers — persistence (Drizzle tables), aggregation (pure function `aggregate(config, pieces)`), render (DynamicChart registry). The aggregation function is pure and in-memory today; it is the only thing to swap if the dataset grows.

**Tech Stack:** Next.js 16, Drizzle ORM + postgres-js, tRPC v11, Clerk auth, Recharts, shadcn/ui, Vitest, Zod.

**Spec:** [docs/superpowers/specs/2026-07-22-dashboard-custom-charts-design.md](../specs/2026-07-22-dashboard-custom-charts-design.md)

## Global Constraints

- Drizzle schema lives at `src/server/db/schema/index.ts` (re-exports sub-files). Add new tables in `src/server/db/schema/dashboard.ts` and re-export.
- Migrations go to `./drizzle/` (configured in `drizzle.config.ts`). Use `pnpm db:generate` to create them, `pnpm db:push` to apply locally.
- tRPC context already has `userId`, `orgId` (Clerk), `orgDbId` (UUID). Extend with role lookup for `adminProcedure`.
- All admin-gated mutations call `adminProcedure` (new). Role check = `users.role === 'admin'` for the current Clerk user. No new role added.
- Reuse existing UI primitives from `src/components/ui/*`. No new dependencies.
- Enums for chart types / field names live in the DB and are mirrored as TS string literal unions — never let the wizard send free-form column names.
- Charts without assignments = visible to all orgs. Charts with assignments = visible only to assigned orgs.

---

## File Structure

```
src/server/db/schema/
  index.ts                        MODIFY  re-export dashboard schema
  dashboard.ts                    NEW     enums + tables

src/lib/
  chart-types.ts                  NEW     TS types, Zod schemas, catalog of dimensions/metrics
  aggregate.ts                    NEW     pure aggregation function
  aggregate.test.ts               NEW     vitest tests for aggregate
  dashboard-charts.ts             NEW     visibility query helper

src/server/
  trpc.ts                         MODIFY  add adminProcedure
  routers/
    index.ts                      MODIFY  register dashboardCharts router
    dashboard-charts.ts           NEW     7 tRPC endpoints

src/app/(app)/dashboard/
  page.tsx                        MODIFY  fetch visible charts server-side
  dashboard-content.tsx           MODIFY  render <CustomSection>
  custom-section.tsx              NEW     maps configs → <DynamicChart>
  dynamic-chart.tsx               NEW     registry: switch on chartType
  charts/
    bar-chart.tsx                 NEW
    pie-chart.tsx                 NEW
    line-chart.tsx                NEW
    kpi-tile.tsx                  NEW
  admin/
    page.tsx                      NEW     list of charts (admin only)
    new/page.tsx                  NEW     wizard
    [id]/edit/page.tsx            NEW     edit + delete

vitest.config.ts                  NEW
src/test/setup.ts                 NEW     vitest setup
```

---

## Phase 1 — DB + Types

### Task 1: Add schema (enums + tables)

**Files:**
- Create: `src/server/db/schema/dashboard.ts`
- Modify: `src/server/db/schema/index.ts` (add export)

**Step 1: Write the new schema file**

Create `src/server/db/schema/dashboard.ts`:

```ts
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  integer,
  timestamp,
  jsonb,
  primaryKey,
} from "drizzle-orm/pg-core";
import { organizations } from "./index";

export const chartTypeEnum = pgEnum("chart_type", [
  "bar",
  "pie",
  "line",
  "kpi",
]);

export const fieldNameEnum = pgEnum("field_name", [
  "materialClass",
  "materialDetail",
  "wasteType",
  "isDomiciliary",
  "salesYear",
  "weightGrams",
  "unitsSold",
]);

export const aggregationEnum = pgEnum("aggregation", [
  "sum",
  "avg",
  "count",
]);

export const dashboardCharts = pgTable("dashboard_charts", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  chartType: chartTypeEnum("chart_type").notNull(),
  dimension: fieldNameEnum("dimension"),
  metric: fieldNameEnum("metric").notNull(),
  aggregation: aggregationEnum("aggregation").notNull(),
  filters: jsonb("filters"),
  position: integer("position").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const dashboardChartAssignments = pgTable(
  "dashboard_chart_assignments",
  {
    chartId: uuid("chart_id")
      .references(() => dashboardCharts.id, { onDelete: "cascade" })
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.chartId, t.organizationId] })],
);
```

**Step 2: Re-export from the schema index**

In `src/server/db/schema/index.ts`, append at the bottom:

```ts
export * from "./dashboard";
```

**Step 3: Commit**

```bash
git add src/server/db/schema/dashboard.ts src/server/db/schema/index.ts
git commit -m "feat(dashboard): add dashboard_charts + assignments schema"
```

---

### Task 2: Generate + apply migration

**Files:**
- Create: `drizzle/0001_<auto>_dashboard_charts.sql` (auto-generated)

**Step 1: Generate migration**

Run:
```bash
pnpm db:generate
```

Expected: a new SQL file appears under `./drizzle/` with `CREATE TYPE chart_type`, `CREATE TYPE field_name`, `CREATE TYPE aggregation`, `CREATE TABLE dashboard_charts`, `CREATE TABLE dashboard_chart_assignments`.

**Step 2: Apply to local DB**

Run:
```bash
pnpm db:push
```

Expected: no errors. If the DB is not running, start it with `pg_ctl start -D <data-dir>` (per project memory) and retry.

**Step 3: Commit**

```bash
git add drizzle/
git commit -m "feat(db): generate migration for dashboard_charts"
```

---

### Task 3: Chart types + Zod schemas + catalog

**Files:**
- Create: `src/lib/chart-types.ts`

**Step 1: Write the types file**

```ts
import { z } from "zod";

// ── DB enum mirrors ───────────────────────────────────────────
export const CHART_TYPES = ["bar", "pie", "line", "kpi"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export const DIMENSION_FIELDS = [
  "materialClass",
  "materialDetail",
  "wasteType",
  "isDomiciliary",
  "salesYear",
] as const;
export type DimensionField = (typeof DIMENSION_FIELDS)[number];

export const METRIC_FIELDS = ["weightGrams", "unitsSold"] as const;
export type MetricField = (typeof METRIC_FIELDS)[number];

export const AGGREGATIONS = ["sum", "avg", "count"] as const;
export type Aggregation = (typeof AGGREGATIONS)[number];

// "count" is implicit COUNT(*) of pieces — no source column needed.
// So `metric` in the DB enum covers weightGrams | unitsSold | null,
// and we model "pieces" as a separate metric in the wizard.

export const WIZARD_METRICS = [
  { value: "weightGrams", label: "Peso total (g)" },
  { value: "unitsSold", label: "Unidades vendidas" },
  { value: "pieces", label: "Cantidad de piezas" },
] as const;

// ── Zod schemas (single source of truth) ──────────────────────
export const ChartFiltersSchema = z
  .object({
    materialClass: z.array(z.string()).optional(),
    materialDetail: z.array(z.string()).optional(),
    wasteType: z.array(z.enum(["recyclable", "non_recyclable"])).optional(),
    isDomiciliary: z.boolean().optional(),
  })
  .strict();

export type ChartFilters = z.infer<typeof ChartFiltersSchema>;

export const ChartConfigInputSchema = z
  .object({
    name: z.string().min(1).max(200),
    chartType: z.enum(CHART_TYPES),
    dimension: z.enum(DIMENSION_FIELDS).optional(),
    metric: z.enum(["weightGrams", "unitsSold", "pieces"]),
    aggregation: z.enum(AGGREGATIONS),
    filters: ChartFiltersSchema.optional(),
    organizationIds: z.array(z.string().uuid()).optional(), // empty/undefined → all
  })
  .refine(
    (cfg) => cfg.chartType !== "kpi" ? !!cfg.dimension : true,
    { message: "dimension requerido para bar/pie/line", path: ["dimension"] },
  )
  .refine(
    (cfg) => cfg.chartType === "line" ? cfg.dimension === "salesYear" : true,
    { message: "line sólo permite salesYear como dimensión", path: ["dimension"] },
  )
  .refine(
    (cfg) =>
      cfg.metric === "pieces"
        ? cfg.aggregation === "count"
        : cfg.aggregation !== "count",
    { message: "count sólo aplica a metric=pieces", path: ["aggregation"] },
  );

export type ChartConfigInput = z.infer<typeof ChartConfigInputSchema>;
```

**Step 2: Commit**

```bash
git add src/lib/chart-types.ts
git commit -m "feat(dashboard): add chart types, zod schemas, catalog"
```

---

## Phase 2 — Aggregation Engine (Pure, TDD)

### Task 4: Set up Vitest

**Files:**
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`

**Step 1: Write vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
```

**Step 2: Write src/test/setup.ts**

```ts
// Empty setup — placeholder for shared mocks later.
export {};
```

**Step 3: Add `test` script to package.json**

In `package.json` under `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 4: Verify**

Run: `pnpm test`
Expected: 0 tests found, exit 0. (Vitest is wired up; no tests yet.)

**Step 5: Commit**

```bash
git add vitest.config.ts src/test/setup.ts package.json
git commit -m "chore: wire up vitest"
```

---

### Task 5: Aggregation function — TDD

**Files:**
- Create: `src/lib/aggregate.test.ts`
- Create: `src/lib/aggregate.ts`

**Step 1: Write the failing tests**

Create `src/lib/aggregate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { aggregate } from "./aggregate";
import type { ChartConfig } from "./chart-types";

type Piece = {
  materialClass: string;
  materialDetail: string;
  weightGrams: number;
  wasteType: "recyclable" | "non_recyclable";
  isDomiciliary: boolean;
  salesYear: number | null;
  unitsSold: number | null;
};

const PIECES: Piece[] = [
  { materialClass: "Plástico", materialDetail: "PET",   weightGrams: 100, wasteType: "recyclable",     isDomiciliary: true,  salesYear: 2024, unitsSold: 10 },
  { materialClass: "Plástico", materialDetail: "PET",   weightGrams: 200, wasteType: "recyclable",     isDomiciliary: true,  salesYear: 2024, unitsSold: 5  },
  { materialClass: "Vidrio",   materialDetail: "Cristal", weightGrams: 500, wasteType: "recyclable",   isDomiciliary: true,  salesYear: 2024, unitsSold: 8  },
  { materialClass: "Vidrio",   materialDetail: "Cristal", weightGrams: 300, wasteType: "non_recyclable", isDomiciliary: false, salesYear: 2025, unitsSold: 4  },
];

const baseConfig: ChartConfig = {
  chartType: "bar",
  dimension: "materialClass",
  metric: "weightGrams",
  aggregation: "sum",
};

describe("aggregate", () => {
  it("KPI: returns single-element series with sum", () => {
    const cfg = { ...baseConfig, chartType: "kpi" as const, dimension: undefined };
    expect(aggregate(cfg, PIECES)).toEqual([
      { label: "Total", value: 1100 },
    ]);
  });

  it("BAR: groups by dimension and sums metric, descending", () => {
    const result = aggregate(baseConfig, PIECES);
    expect(result).toEqual([
      { label: "Vidrio", value: 800 },
      { label: "Plástico", value: 300 },
    ]);
  });

  it("PIE: same shape as bar (label + value)", () => {
    const cfg = { ...baseConfig, chartType: "pie" as const };
    expect(aggregate(cfg, PIECES)).toEqual(aggregate(baseConfig, PIECES));
  });

  it("LINE: groups by salesYear (numeric coerced to string label)", () => {
    const cfg = { ...baseConfig, chartType: "line" as const, dimension: "salesYear" as const };
    const result = aggregate(cfg, PIECES);
    expect(result).toEqual([
      { label: "2024", value: 800 },
      { label: "2025", value: 300 },
    ]);
  });

  it("AVG aggregation", () => {
    const cfg = { ...baseConfig, aggregation: "avg" as const };
    expect(aggregate(cfg, PIECES)).toEqual([
      { label: "Plástico", value: 150 }, // (100+200)/2
      { label: "Vidrio",   value: 400 }, // (500+300)/2
    ]);
  });

  it("COUNT aggregation on weightGrams metric is invalid → throws", () => {
    const cfg = { ...baseConfig, aggregation: "count" as const };
    expect(() => aggregate(cfg, PIECES)).toThrow(/count/);
  });

  it("applies saved filters before aggregating", () => {
    const cfg: ChartConfig = {
      ...baseConfig,
      filters: { materialClass: ["Vidrio"] },
    };
    expect(aggregate(cfg, PIECES)).toEqual([
      { label: "Vidrio", value: 800 },
    ]);
  });

  it("filters by isDomiciliary boolean", () => {
    const cfg: ChartConfig = {
      ...baseConfig,
      filters: { isDomiciliary: true },
    };
    expect(aggregate(cfg, PIECES)).toEqual([
      { label: "Plástico", value: 300 },
      { label: "Vidrio",   value: 500 },
    ]);
  });

  it("returns empty array when no pieces match", () => {
    expect(aggregate(baseConfig, [])).toEqual([]);
    const cfg: ChartConfig = {
      ...baseConfig,
      filters: { materialClass: ["Madera"] },
    };
    expect(aggregate(cfg, PIECES)).toEqual([]);
  });

  it("coerces null salesYear to 'Sin año'", () => {
    const withNull: Piece[] = [
      { ...PIECES[0], salesYear: null },
    ];
    const cfg = { ...baseConfig, chartType: "kpi" as const, dimension: undefined };
    expect(aggregate(cfg, withNull)).toEqual([{ label: "Total", value: 100 }]);
  });
});
```

**Step 2: Run — verify all fail**

Run: `pnpm test`
Expected: 10 failures, "aggregate is not a function".

**Step 3: Implement `aggregate`**

Create `src/lib/aggregate.ts`:

```ts
import type { ChartConfig, Aggregation, ChartFilters } from "./chart-types";

type Piece = {
  materialClass: string;
  materialDetail: string;
  weightGrams: number;
  wasteType: "recyclable" | "non_recyclable";
  isDomiciliary: boolean;
  salesYear: number | null;
  unitsSold: number | null;
};

export type ChartSeries = Array<{ label: string; value: number }>;

function applyFilters(pieces: readonly Piece[], f?: ChartFilters): Piece[] {
  if (!f) return [...pieces];
  return pieces.filter((p) => {
    if (f.materialClass?.length && !f.materialClass.includes(p.materialClass)) return false;
    if (f.materialDetail?.length && !f.materialDetail.includes(p.materialDetail)) return false;
    if (f.wasteType?.length && !f.wasteType.includes(p.wasteType)) return false;
    if (f.isDomiciliary !== undefined && p.isDomiciliary !== f.isDomiciliary) return false;
    return true;
  });
}

function dimLabel(p: Piece, dim: NonNullable<ChartConfig["dimension"]>): string {
  const v = p[dim];
  if (v === null || v === undefined) return "Sin año";
  if (typeof v === "boolean") return v ? "Domiciliario" : "No domiciliario";
  return String(v);
}

function metricValue(p: Piece, metric: ChartConfig["metric"]): number {
  if (metric === "weightGrams") return p.weightGrams;
  if (metric === "unitsSold") return p.unitsSold ?? 0;
  return 1; // "pieces"
}

function reduce(group: number[], agg: Aggregation, metric: ChartConfig["metric"]): number {
  if (agg === "count") {
    if (metric !== "pieces") {
      throw new Error("count sólo se aplica a metric=pieces");
    }
    return group.length;
  }
  if (group.length === 0) return 0;
  const sum = group.reduce((a, b) => a + b, 0);
  return agg === "sum" ? sum : sum / group.length;
}

export function aggregate(config: ChartConfig, pieces: readonly Piece[]): ChartSeries {
  const filtered = applyFilters(pieces, config.filters);

  // KPI: aggregate over the whole filtered set
  if (config.chartType === "kpi" || !config.dimension) {
    const values = filtered.map((p) => metricValue(p, config.metric));
    return [{ label: "Total", value: reduce(values, config.aggregation, config.metric) }];
  }

  // Grouped: bar / pie / line
  const groups = new Map<string, number[]>();
  for (const p of filtered) {
    const label = dimLabel(p, config.dimension);
    const arr = groups.get(label) ?? [];
    arr.push(metricValue(p, config.metric));
    groups.set(label, arr);
  }

  const series: ChartSeries = [];
  for (const [label, values] of groups) {
    series.push({ label, value: reduce(values, config.aggregation, config.metric) });
  }
  series.sort((a, b) => b.value - a.value);
  return series;
}
```

**Step 4: Add the type re-export**

In `src/lib/chart-types.ts`, the `ChartConfig` type is used by the tests but not yet defined there. Append:

```ts
export type ChartConfig = {
  id?: string;
  name?: string;
  chartType: ChartType;
  dimension?: DimensionField | null;
  metric: MetricField | "pieces";
  aggregation: Aggregation;
  filters?: ChartFilters;
};
```

**Step 5: Run — verify all pass**

Run: `pnpm test`
Expected: 10 passing.

**Step 6: Commit**

```bash
git add src/lib/aggregate.ts src/lib/aggregate.test.ts src/lib/chart-types.ts
git commit -m "feat(dashboard): pure aggregate() with 10 unit tests"
```

---

## Phase 3 — API + Visibility

### Task 6: Add `adminProcedure`

**Files:**
- Modify: `src/server/trpc.ts` (append)

**Step 1: Add the procedure**

At the end of `src/server/trpc.ts`:

```ts
import { users } from "@/server/db/schema";

/**
 * Procedure admin-only — chequea que el usuario autenticado tenga role='admin'.
 * Usado por mutaciones del dashboard builder.
 */
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const row = await ctx.db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.clerkUserId, ctx.userId))
    .limit(1);

  if (row[0]?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Se requiere rol admin" });
  }

  return next({ ctx });
});
```

Add `eq` to the existing drizzle-orm import line at the top:
```ts
import { eq } from "drizzle-orm";
```

**Step 2: Verify it compiles**

Run: `pnpm tsc --noEmit`
Expected: no errors. (Or `pnpm build` if there's no tsc script.)

**Step 3: Commit**

```bash
git add src/server/trpc.ts
git commit -m "feat(server): add adminProcedure gated by users.role=admin"
```

---

### Task 7: Visibility query helper

**Files:**
- Create: `src/lib/dashboard-charts.ts`

**Step 1: Write the helper**

```ts
import { db } from "@/server/db";
import {
  dashboardCharts,
  dashboardChartAssignments,
} from "@/server/db/schema";
import { eq, or, isNull } from "drizzle-orm";

/**
 * Devuelve los charts visibles para una organización.
 * Regla: chart sin assignments = global; chart con assignments = sólo las orgs listadas.
 * Dedup con Map porque el leftJoin puede repetir filas.
 */
export async function getVisibleCharts(orgDbId: string | null) {
  const rows = await db
    .select({
      chart: dashboardCharts,
      assignedOrgId: dashboardChartAssignments.organizationId,
    })
    .from(dashboardCharts)
    .leftJoin(
      dashboardChartAssignments,
      eq(dashboardChartAssignments.chartId, dashboardCharts.id),
    )
    .where(
      orgDbId
        ? or(
            isNull(dashboardChartAssignments.organizationId),
            eq(dashboardChartAssignments.organizationId, orgDbId),
          )
        : isNull(dashboardChartAssignments.organizationId),
    )
    .orderBy(dashboardCharts.position);

  const seen = new Map<string, typeof rows[number]["chart"]>();
  for (const r of rows) {
    if (!seen.has(r.chart.id)) seen.set(r.chart.id, r.chart);
  }
  return Array.from(seen.values());
}
```

**Step 2: Commit**

```bash
git add src/lib/dashboard-charts.ts
git commit -m "feat(dashboard): visibility query — global OR assigned to org"
```

---

### Task 8: tRPC router — list / get

**Files:**
- Create: `src/server/routers/dashboard-charts.ts`

**Step 1: Write the read endpoints**

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { createTRPCRouter, orgProcedure, adminProcedure } from "@/server/trpc";
import {
  dashboardCharts,
  dashboardChartAssignments,
} from "@/server/db/schema";
import { getVisibleCharts } from "@/lib/dashboard-charts";

export const dashboardChartsRouter = createTRPCRouter({
  /** Charts visibles para la org activa (sin org activa = sólo globales). */
  list: orgProcedure.query(async ({ ctx }) => {
    return getVisibleCharts(ctx.orgDbId);
  }),

  /** Un chart por id. 404 si no es visible para la org activa. */
  get: orgProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const visible = await getVisibleCharts(ctx.orgDbId);
      const chart = visible.find((c) => c.id === input.id);
      if (!chart) throw new TRPCError({ code: "NOT_FOUND" });
      return chart;
    }),
});
```

**Step 2: Commit (the rest of the router comes in Task 9)**

```bash
git add src/server/routers/dashboard-charts.ts
git commit -m "feat(dashboard-charts): list + get tRPC endpoints"
```

---

### Task 9: tRPC router — create / update / delete / reorder / assign

**Files:**
- Modify: `src/server/routers/dashboard-charts.ts` (append before final `});`)

**Step 1: Append all write endpoints**

```ts
  create: adminProcedure
    .input(ChartConfigInputSchema)
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(dashboardCharts)
        .values({
          name: input.name,
          chartType: input.chartType,
          dimension: input.chartType === "kpi" ? null : (input.dimension ?? null),
          metric: input.metric,
          aggregation: input.aggregation,
          filters: input.filters ?? null,
        })
        .returning();

      if (input.organizationIds?.length) {
        await ctx.db.insert(dashboardChartAssignments).values(
          input.organizationIds.map((organizationId) => ({
            chartId: row.id,
            organizationId,
          })),
        );
      }
      return row;
    }),

  update: adminProcedure
    .input(ChartConfigInputSchema.partial().extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, organizationIds, ...rest } = input;
      const [row] = await ctx.db
        .update(dashboardCharts)
        .set({
          name: rest.name,
          chartType: rest.chartType,
          dimension: rest.chartType === "kpi" ? null : rest.dimension ?? null,
          metric: rest.metric,
          aggregation: rest.aggregation,
          filters: rest.filters ?? null,
        })
        .where(eq(dashboardCharts.id, id))
        .returning();

      if (organizationIds) {
        await ctx.db
          .delete(dashboardChartAssignments)
          .where(eq(dashboardChartAssignments.chartId, id));
        if (organizationIds.length) {
          await ctx.db.insert(dashboardChartAssignments).values(
            organizationIds.map((organizationId) => ({ chartId: id, organizationId })),
          );
        }
      }
      return row;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(dashboardCharts).where(eq(dashboardCharts.id, input.id));
      return { id: input.id };
    }),

  reorder: adminProcedure
    .input(z.array(z.object({ id: z.string().uuid(), position: z.number().int() })))
    .mutation(async ({ ctx, input }) => {
      await Promise.all(
        input.map((item) =>
          ctx.db
            .update(dashboardCharts)
            .set({ position: item.position })
            .where(eq(dashboardCharts.id, item.id)),
        ),
      );
      return { ok: true };
    }),

  assign: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        organizationIds: z.array(z.string().uuid()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(dashboardChartAssignments)
        .where(eq(dashboardChartAssignments.chartId, input.id));
      if (input.organizationIds.length) {
        await ctx.db.insert(dashboardChartAssignments).values(
          input.organizationIds.map((organizationId) => ({
            chartId: input.id,
            organizationId,
          })),
        );
      }
      return { ok: true };
    }),

  /** Lista todas las orgs — usado por el wizard. */
  listOrganizations: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.query.organizations.findMany({
      columns: { id: true, name: true, rut: true },
      orderBy: (o, { asc }) => asc(o.name),
    });
  }),
```

And add the `ChartConfigInputSchema` import at the top of the file:

```ts
import { ChartConfigInputSchema } from "@/lib/chart-types";
```

**Step 2: Register the router**

In `src/server/routers/index.ts`:

```ts
import { dashboardChartsRouter } from "./dashboard-charts";

export const appRouter = createTRPCRouter({
  // ...existing routers
  dashboardCharts: dashboardChartsRouter,
});
```

**Step 3: Verify it compiles**

Run: `pnpm tsc --noEmit` (or `pnpm build`)
Expected: no errors.

**Step 4: Commit**

```bash
git add src/server/routers/dashboard-charts.ts src/server/routers/index.ts
git commit -m "feat(dashboard-charts): create/update/delete/reorder/assign endpoints"
```

---

## Phase 4 — Admin Wizard

### Task 10: Admin list page

**Files:**
- Create: `src/app/(app)/dashboard/admin/page.tsx`

**Step 1: Write the page**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users, dashboardCharts } from "@/server/db/schema";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusIcon, PencilIcon, TrashIcon } from "lucide-react";

export default async function AdminPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const u = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.clerkUserId, userId))
    .limit(1);
  if (u[0]?.role !== "admin") {
    return <p className="p-8 text-muted-foreground">Se requiere rol admin.</p>;
  }

  const charts = await db.select().from(dashboardCharts).orderBy(dashboardCharts.position);

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Widgets configurables</h1>
          <p className="text-muted-foreground mt-1">
            Crea gráficos personalizados que verán las empresas seleccionadas.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/admin/new"><PlusIcon className="mr-2 h-4 w-4" /> Nuevo widget</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {charts.length === 0 && (
          <Card className="md:col-span-2 lg:col-span-3">
            <CardContent className="p-8 text-center text-muted-foreground">
              Aún no hay widgets. Crea el primero.
            </CardContent>
          </Card>
        )}
        {charts.map((c) => (
          <Card key={c.id}>
            <CardHeader>
              <CardTitle className="text-base">{c.name}</CardTitle>
              <CardDescription>
                {c.chartType.toUpperCase()} · {c.aggregation.toUpperCase()} de {c.metric}
                {c.dimension ? ` por ${c.dimension}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/dashboard/admin/${c.id}/edit`}>
                  <PencilIcon className="mr-1 h-3 w-3" /> Editar
                </Link>
              </Button>
              {/* Delete handled on edit page to keep this card simple */}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Verify the page renders (dev server)**

Run: `pnpm dev`, open `http://localhost:3000/dashboard/admin`.
Expected: list page with "Aún no hay widgets" (or existing charts if you've added some manually).

**Step 3: Commit**

```bash
git add src/app/(app)/dashboard/admin/page.tsx
git commit -m "feat(admin): list page for dashboard charts"
```

---

### Task 11: Admin wizard (new)

**Files:**
- Create: `src/app/(app)/dashboard/admin/new/page.tsx`

**Step 1: Write the wizard**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { CHART_TYPES, DIMENSION_FIELDS, WIZARD_METRICS, AGGREGATIONS } from "@/lib/chart-types";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";

export default function NewChartPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const orgs = trpc.dashboardCharts.listOrganizations.useQuery();
  const create = trpc.dashboardCharts.create.useMutation({
    onSuccess: () => {
      utils.dashboardCharts.list.invalidate();
      router.push("/dashboard/admin");
    },
  });

  const [name, setName] = useState("");
  const [chartType, setChartType] = useState<typeof CHART_TYPES[number]>("bar");
  const [dimension, setDimension] = useState<string>("materialClass");
  const [metric, setMetric] = useState<string>("weightGrams");
  const [aggregation, setAggregation] = useState<typeof AGGREGATIONS[number]>("sum");
  const [visibleToAll, setVisibleToAll] = useState(true);
  const [selectedOrgs, setSelectedOrgs] = useState<Set<string>>(new Set());

  const allowedDimensions = chartType === "kpi" ? []
    : chartType === "line" ? ["salesYear"]
    : [...DIMENSION_FIELDS];
  const aggregationOptions = metric === "pieces"
    ? ["count"] as const
    : AGGREGATIONS.filter((a) => a !== "count");

  function submit() {
    create.mutate({
      name,
      chartType,
      dimension: chartType === "kpi" ? undefined : dimension,
      metric,
      aggregation,
      organizationIds: visibleToAll ? undefined : Array.from(selectedOrgs),
    });
  }

  return (
    <div className="space-y-6 p-8 max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight">Nuevo widget</h1>

      <Card>
        <CardHeader>
          <CardTitle>Configuración</CardTitle>
          <CardDescription>Define cómo se agrupan y agregan los datos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Peso por material" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={chartType} onValueChange={(v) => setChartType(v as typeof chartType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHART_TYPES.map((t) => <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {allowedDimensions.length > 0 && (
              <div className="space-y-1">
                <Label>Dimensión</Label>
                <Select value={dimension} onValueChange={setDimension}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {allowedDimensions.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label>Métrica</Label>
              <Select value={metric} onValueChange={setMetric}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WIZARD_METRICS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Agregación</Label>
              <Select value={aggregation} onValueChange={(v) => setAggregation(v as typeof aggregation)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {aggregationOptions.map((a) => <SelectItem key={a} value={a}>{a.toUpperCase()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Asignación</CardTitle>
          <CardDescription>
            Si está apagado, debes elegir al menos una empresa (si no, nadie lo verá).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Visible para todas las empresas</Label>
            <Switch checked={visibleToAll} onCheckedChange={setVisibleToAll} />
          </div>
          {!visibleToAll && (
            <div className="space-y-2 max-h-64 overflow-y-auto border rounded p-3">
              {orgs.data?.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedOrgs.has(o.id)}
                    onCheckedChange={(checked) => {
                      const next = new Set(selectedOrgs);
                      if (checked) next.add(o.id); else next.delete(o.id);
                      setSelectedOrgs(next);
                    }}
                  />
                  {o.name} {o.rut && <span className="text-muted-foreground">· {o.rut}</span>}
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => router.back()}>Cancelar</Button>
        <Button onClick={submit} disabled={!name || create.isPending}>
          {create.isPending ? "Guardando..." : "Guardar"}
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: Verify**

Open `http://localhost:3000/dashboard/admin/new`, fill the form, save.
Expected: redirects to `/dashboard/admin` and the new chart appears.

**Step 3: Commit**

```bash
git add src/app/(app)/dashboard/admin/new/page.tsx
git commit -m "feat(admin): wizard for new dashboard chart"
```

---

### Task 12: Admin edit + delete

**Files:**
- Create: `src/app/(app)/dashboard/admin/[id]/edit/page.tsx`

**Step 1: Write the edit page**

```tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { CHART_TYPES, DIMENSION_FIELDS, WIZARD_METRICS, AGGREGATIONS } from "@/lib/chart-types";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { TrashIcon } from "lucide-react";

export default function EditChartPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const utils = trpc.useUtils();

  const chart = trpc.dashboardCharts.get.useQuery({ id });
  const orgs = trpc.dashboardCharts.listOrganizations.useQuery();
  const update = trpc.dashboardCharts.update.useMutation({
    onSuccess: () => { utils.dashboardCharts.list.invalidate(); router.push("/dashboard/admin"); },
  });
  const remove = trpc.dashboardCharts.delete.useMutation({
    onSuccess: () => { utils.dashboardCharts.list.invalidate(); router.push("/dashboard/admin"); },
  });

  const [name, setName] = useState("");
  const [chartType, setChartType] = useState<typeof CHART_TYPES[number]>("bar");
  const [dimension, setDimension] = useState<string>("materialClass");
  const [metric, setMetric] = useState<string>("weightGrams");
  const [aggregation, setAggregation] = useState<typeof AGGREGATIONS[number]>("sum");
  const [visibleToAll, setVisibleToAll] = useState(true);
  const [selectedOrgs, setSelectedOrgs] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!chart.data) return;
    setName(chart.data.name);
    setChartType(chart.data.chartType as typeof chartType);
    setDimension(chart.data.dimension ?? "materialClass");
    setMetric(chart.data.metric);
    setAggregation(chart.data.aggregation as typeof aggregation);
    // For MVP we don't load the actual assignment list — toggle starts true if no rows.
    // (Loading assignments requires an extra query; acceptable to re-save from default.)
    setVisibleToAll(true);
    setSelectedOrgs(new Set());
  }, [chart.data]);

  const allowedDimensions = chartType === "kpi" ? []
    : chartType === "line" ? ["salesYear"]
    : [...DIMENSION_FIELDS];
  const aggregationOptions = metric === "pieces"
    ? ["count"] as const
    : AGGREGATIONS.filter((a) => a !== "count");

  function submit() {
    update.mutate({
      id,
      name,
      chartType,
      dimension: chartType === "kpi" ? undefined : dimension,
      metric,
      aggregation,
      organizationIds: visibleToAll ? undefined : Array.from(selectedOrgs),
    });
  }

  if (chart.isLoading) return <p className="p-8 text-muted-foreground">Cargando...</p>;
  if (chart.error) return <p className="p-8 text-destructive">Error: {chart.error.message}</p>;

  return (
    <div className="space-y-6 p-8 max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight">Editar widget</h1>

      <Card>
        <CardHeader>
          <CardTitle>Configuración</CardTitle>
          <CardDescription>Modifica los parámetros del widget.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={chartType} onValueChange={(v) => setChartType(v as typeof chartType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHART_TYPES.map((t) => <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {allowedDimensions.length > 0 && (
              <div className="space-y-1">
                <Label>Dimensión</Label>
                <Select value={dimension} onValueChange={setDimension}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {allowedDimensions.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Métrica</Label>
              <Select value={metric} onValueChange={setMetric}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WIZARD_METRICS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Agregación</Label>
              <Select value={aggregation} onValueChange={(v) => setAggregation(v as typeof aggregation)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {aggregationOptions.map((a) => <SelectItem key={a} value={a}>{a.toUpperCase()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Asignación</CardTitle>
          <CardDescription>Si lo apagas, se reescriben las asignaciones (vacío = nadie lo ve).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Visible para todas las empresas</Label>
            <Switch checked={visibleToAll} onCheckedChange={setVisibleToAll} />
          </div>
          {!visibleToAll && (
            <div className="space-y-2 max-h-64 overflow-y-auto border rounded p-3">
              {orgs.data?.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedOrgs.has(o.id)}
                    onCheckedChange={(checked) => {
                      const next = new Set(selectedOrgs);
                      if (checked) next.add(o.id); else next.delete(o.id);
                      setSelectedOrgs(next);
                    }}
                  />
                  {o.name} {o.rut && <span className="text-muted-foreground">· {o.rut}</span>}
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button
          variant="destructive"
          onClick={() => {
            if (confirm(`¿Eliminar "${name}"?`)) remove.mutate({ id });
          }}
          disabled={remove.isPending}
        >
          <TrashIcon className="mr-2 h-4 w-4" /> Eliminar
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>Cancelar</Button>
          <Button onClick={submit} disabled={!name || update.isPending}>
            {update.isPending ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify**

Open `/dashboard/admin/<id>/edit`, change name, save.
Then open again, click "Eliminar", confirm.
Expected: redirects to list, the chart is gone.

**Step 3: Commit**

```bash
git add src/app/(app)/dashboard/admin/[id]/edit/page.tsx
git commit -m "feat(admin): edit + delete dashboard chart"
```

---

## Phase 5 — Dashboard Integration

### Task 13: Four chart components

**Files:**
- Create: `src/app/(app)/dashboard/charts/bar-chart.tsx`
- Create: `src/app/(app)/dashboard/charts/pie-chart.tsx`
- Create: `src/app/(app)/dashboard/charts/line-chart.tsx`
- Create: `src/app/(app)/dashboard/charts/kpi-tile.tsx`

**Step 1: Bar chart**

Create `src/app/(app)/dashboard/charts/bar-chart.tsx`:

```tsx
"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { wasteColor } from "@/lib/brand";

export function BarChartView({ data }: { data: { label: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={wasteColor(d.label, i)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
```

**Step 2: Pie chart**

Create `src/app/(app)/dashboard/charts/pie-chart.tsx`:

```tsx
"use client";

import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { wasteColor } from "@/lib/brand";

export function PieChartView({ data }: { data: { label: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="label" outerRadius={100} label>
          {data.map((d, i) => <Cell key={i} fill={wasteColor(d.label, i)} />)}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

**Step 3: Line chart**

Create `src/app/(app)/dashboard/charts/line-chart.tsx`:

```tsx
"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

export function LineChartView({ data }: { data: { label: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

**Step 4: KPI tile**

Create `src/app/(app)/dashboard/charts/kpi-tile.tsx`:

```tsx
"use client";

export function KpiTile({ data, name }: { data: { label: string; value: number }[]; name: string }) {
  const value = data[0]?.value ?? 0;
  const formatted = Number.isInteger(value)
    ? value.toLocaleString("es-CL")
    : value.toFixed(2);
  return (
    <div className="flex h-full flex-col items-center justify-center p-4">
      <p className="text-sm text-muted-foreground">{name}</p>
      <p className="text-4xl font-bold mt-2">{formatted}</p>
    </div>
  );
}
```

**Step 5: Commit**

```bash
git add src/app/(app)/dashboard/charts/
git commit -m "feat(dashboard): 4 chart components (bar/pie/line/kpi)"
```

---

### Task 14: DynamicChart registry + CustomSection

**Files:**
- Create: `src/app/(app)/dashboard/dynamic-chart.tsx`
- Create: `src/app/(app)/dashboard/custom-section.tsx`

**Step 1: DynamicChart**

Create `src/app/(app)/dashboard/dynamic-chart.tsx`:

```tsx
"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { ChartConfig } from "@/lib/chart-types";
import type { Piece } from "./dashboard-content";
import { aggregate } from "@/lib/aggregate";
import { BarChartView } from "./charts/bar-chart";
import { PieChartView } from "./charts/pie-chart";
import { LineChartView } from "./charts/line-chart";
import { KpiTile } from "./charts/kpi-tile";

export function DynamicChart({ config, pieces }: { config: ChartConfig; pieces: readonly Piece[] }) {
  const data = aggregate(config, pieces);
  const series = data;

  let body: React.ReactNode;
  if (config.chartType === "bar") body = <BarChartView data={series} />;
  else if (config.chartType === "pie") body = <PieChartView data={series} />;
  else if (config.chartType === "line") body = <LineChartView data={series} />;
  else body = <KpiTile data={series} name={config.name ?? ""} />;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{config.name}</CardTitle>
      </CardHeader>
      <CardContent className={config.chartType === "kpi" ? "" : "h-[280px]"}>
        {body}
      </CardContent>
    </Card>
  );
}
```

**Step 2: CustomSection**

Create `src/app/(app)/dashboard/custom-section.tsx`:

```tsx
"use client";

import type { ChartConfig } from "@/lib/chart-types";
import type { Piece } from "./dashboard-content";
import { DynamicChart } from "./dynamic-chart";

export function CustomSection({
  configs, pieces,
}: {
  configs: ChartConfig[];
  pieces: readonly Piece[];
}) {
  if (configs.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight">Widgets configurables</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {configs.map((cfg) => (
          <DynamicChart key={cfg.id} config={cfg} pieces={pieces} />
        ))}
      </div>
    </section>
  );
}
```

**Step 3: Commit**

```bash
git add src/app/(app)/dashboard/dynamic-chart.tsx src/app/(app)/dashboard/custom-section.tsx
git commit -m "feat(dashboard): DynamicChart registry + CustomSection"
```

---

### Task 15: Wire it into the dashboard

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/app/(app)/dashboard/dashboard-content.tsx`

**Step 1: Update page.tsx to fetch visible charts**

Read `src/app/(app)/dashboard/page.tsx` first. It likely already fetches `pieces`. Add a second fetch for `getVisibleCharts(ctx.orgDbId)` and pass `chartConfigs` as a prop.

The minimal change to `page.tsx` is:

```tsx
import { getVisibleCharts } from "@/lib/dashboard-charts";
// ... inside the server component:
const chartConfigs = await getVisibleCharts(orgDbId);
// ... pass to <DashboardContent ... chartConfigs={chartConfigs} />
```

(Keep all existing fetches intact; just add the new one and the prop.)

**Step 2: Add the type export and prop**

In `src/app/(app)/dashboard/dashboard-content.tsx`:

- Export the `Piece` type so `custom-section.tsx` can import it
- Add `chartConfigs` to `DashboardContentProps`
- Render `<CustomSection configs={chartConfigs} pieces={filtered} />` at the bottom of the existing JSX, after the Material Breakdown card

The exact insertion point: after the closing `</Card>` of the breakdown table and before the final `</div>` of the outer container.

**Step 3: Verify end-to-end**

1. `pnpm dev`
2. Create a chart at `/dashboard/admin/new` (e.g., "Peso por material" / BAR / materialClass / weightGrams / SUM)
3. Open `/dashboard`
4. Expected: new section "Widgets configurables" appears below the breakdown table with a bar chart
5. Toggle a global filter (year) → chart re-renders
6. Open `/dashboard/admin/<id>/edit`, change "Visible para todas" to OFF, pick one org only
7. Sign in as a user from another org (or impersonate) → that chart should disappear
8. Switch back to "todas" → reappears

**Step 4: Commit**

```bash
git add src/app/(app)/dashboard/page.tsx src/app/(app)/dashboard/dashboard-content.tsx
git commit -m "feat(dashboard): render CustomSection with visible charts"
```

---

## Verification Checklist (after all tasks)

- [ ] `pnpm test` → all 10 aggregate tests pass
- [ ] `pnpm tsc --noEmit` (or `pnpm build`) → no type errors
- [ ] `pnpm db:push` succeeds (no drift)
- [ ] Create a chart as admin → it appears on `/dashboard`
- [ ] Filter by year on `/dashboard` → custom chart re-aggregates
- [ ] Assign chart to one org only → other orgs (via different Clerk org) don't see it
- [ ] Delete chart from admin → it disappears from dashboard

---

## Out of scope (deferred)

- Drag-and-drop reordering (use the `reorder` endpoint manually for now)
- Custom color palettes per chart
- PDF/PNG export
- Real-time refresh / scheduled recompute
- Per-user dashboards
- SQL/expression builder (the enum catalog is the security boundary)

If any of these come up, add a new spec — do not grow this one.