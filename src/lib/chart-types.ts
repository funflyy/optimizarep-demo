import { z } from "zod";

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

export const WIZARD_METRICS = [
  { value: "weightGrams", label: "Peso total (g)" },
  { value: "unitsSold", label: "Unidades vendidas" },
  { value: "pieces", label: "Cantidad de piezas" },
] as const;

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
    organizationIds: z.array(z.string().uuid()).optional(),
  })
  .refine(
    (cfg) => (cfg.chartType !== "kpi" ? !!cfg.dimension : true),
    { message: "dimension requerido para bar/pie/line", path: ["dimension"] },
  )
  .refine(
    (cfg) => (cfg.chartType === "line" ? cfg.dimension === "salesYear" : true),
    {
      message: "line sólo permite salesYear como dimensión",
      path: ["dimension"],
    },
  )
  .refine(
    (cfg) =>
      cfg.metric === "pieces"
        ? cfg.aggregation === "count"
        : cfg.aggregation !== "count",
    { message: "count sólo aplica a metric=pieces", path: ["aggregation"] },
  );

export type ChartConfigInput = z.infer<typeof ChartConfigInputSchema>;

export type ChartConfig = {
  id?: string;
  name?: string;
  chartType: ChartType;
  dimension?: DimensionField | null;
  metric: MetricField | "pieces";
  aggregation: Aggregation;
  filters?: ChartFilters;
};
