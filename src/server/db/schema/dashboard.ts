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
