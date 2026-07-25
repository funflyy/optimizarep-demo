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
  { materialClass: "Plástico", materialDetail: "PET", weightGrams: 100, wasteType: "recyclable", isDomiciliary: true, salesYear: 2024, unitsSold: 10 },
  { materialClass: "Plástico", materialDetail: "PET", weightGrams: 200, wasteType: "recyclable", isDomiciliary: true, salesYear: 2024, unitsSold: 5 },
  { materialClass: "Vidrio", materialDetail: "Cristal", weightGrams: 500, wasteType: "recyclable", isDomiciliary: true, salesYear: 2024, unitsSold: 8 },
  { materialClass: "Vidrio", materialDetail: "Cristal", weightGrams: 300, wasteType: "non_recyclable", isDomiciliary: false, salesYear: 2025, unitsSold: 4 },
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
    expect(aggregate(cfg, PIECES)).toEqual([{ label: "Total", value: 1100 }]);
  });

  it("BAR: groups by dimension and sums metric, descending", () => {
    const result = aggregate(baseConfig, PIECES);
    expect(result).toEqual([
      { label: "Vidrio", value: 800 },
      { label: "Plástico", value: 300 },
    ]);
  });

  it("PIE: same shape as bar", () => {
    const cfg = { ...baseConfig, chartType: "pie" as const };
    expect(aggregate(cfg, PIECES)).toEqual(aggregate(baseConfig, PIECES));
  });

  it("LINE: groups by salesYear", () => {
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
      { label: "Vidrio", value: 400 },
      { label: "Plástico", value: 150 },
    ]);
  });

  it("COUNT on non-pieces metric throws", () => {
    const cfg = { ...baseConfig, aggregation: "count" as const };
    expect(() => aggregate(cfg, PIECES)).toThrow(/count/);
  });

  it("applies saved filters before aggregating", () => {
    const cfg: ChartConfig = {
      ...baseConfig,
      filters: { materialClass: ["Vidrio"] },
    };
    expect(aggregate(cfg, PIECES)).toEqual([{ label: "Vidrio", value: 800 }]);
  });

  it("filters by isDomiciliary boolean", () => {
    const cfg: ChartConfig = {
      ...baseConfig,
      filters: { isDomiciliary: true },
    };
    expect(aggregate(cfg, PIECES)).toEqual([
      { label: "Vidrio", value: 500 },
      { label: "Plástico", value: 300 },
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
    const withNull: Piece[] = [{ ...PIECES[0], salesYear: null }];
    const cfg = { ...baseConfig, chartType: "kpi" as const, dimension: undefined };
    expect(aggregate(cfg, withNull)).toEqual([{ label: "Total", value: 100 }]);
  });
});
