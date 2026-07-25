"use client";

import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { ChartConfig } from "@/lib/chart-types";
import { aggregate, type Piece } from "@/lib/aggregate";
import { BarChartView } from "./charts/bar-chart";
import { PieChartView } from "./charts/pie-chart";
import { LineChartView } from "./charts/line-chart";
import { KpiTile } from "./charts/kpi-tile";

export function DynamicChart({
  config,
  pieces,
}: {
  config: ChartConfig;
  pieces: readonly Piece[];
}) {
  const series = useMemo(() => aggregate(config, pieces), [config, pieces]);

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
