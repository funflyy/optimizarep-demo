import type { ChartConfig, Aggregation, ChartFilters } from "./chart-types";

export type Piece = {
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
    if (f.materialClass?.length && !f.materialClass.includes(p.materialClass))
      return false;
    if (
      f.materialDetail?.length &&
      !f.materialDetail.includes(p.materialDetail)
    )
      return false;
    if (f.wasteType?.length && !f.wasteType.includes(p.wasteType)) return false;
    if (f.isDomiciliary !== undefined && p.isDomiciliary !== f.isDomiciliary)
      return false;
    return true;
  });
}

function dimLabel(
  p: Piece,
  dim: NonNullable<ChartConfig["dimension"]>,
): string {
  const v = p[dim];
  if (v === null || v === undefined) return "Sin año";
  if (typeof v === "boolean") return v ? "Domiciliario" : "No domiciliario";
  return String(v);
}

function metricValue(p: Piece, metric: ChartConfig["metric"]): number {
  if (metric === "weightGrams") return p.weightGrams;
  if (metric === "unitsSold") return p.unitsSold ?? 0;
  return 1;
}

function reduce(
  group: number[],
  agg: Aggregation,
  metric: ChartConfig["metric"],
): number {
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

export function aggregate(
  config: ChartConfig,
  pieces: readonly Piece[],
): ChartSeries {
  const filtered = applyFilters(pieces, config.filters);

  if (config.chartType === "kpi" || !config.dimension) {
    const values = filtered.map((p) => metricValue(p, config.metric));
    return [
      { label: "Total", value: reduce(values, config.aggregation, config.metric) },
    ];
  }

  const groups = new Map<string, number[]>();
  for (const p of filtered) {
    const label = dimLabel(p, config.dimension);
    const arr = groups.get(label) ?? [];
    arr.push(metricValue(p, config.metric));
    groups.set(label, arr);
  }

  const series: ChartSeries = [];
  for (const [label, values] of groups) {
    series.push({
      label,
      value: reduce(values, config.aggregation, config.metric),
    });
  }
  series.sort((a, b) => b.value - a.value);
  return series;
}
