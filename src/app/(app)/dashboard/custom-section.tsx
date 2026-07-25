"use client";

import type { ChartConfig } from "@/lib/chart-types";
import type { Piece } from "@/lib/aggregate";
import { DynamicChart } from "./dynamic-chart";

export function CustomSection({
  configs,
  pieces,
}: {
  configs: ChartConfig[];
  pieces: readonly Piece[];
}) {
  if (configs.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight">
        Widgets configurables
      </h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {configs.map((cfg) => (
          <DynamicChart key={cfg.id} config={cfg} pieces={pieces} />
        ))}
      </div>
    </section>
  );
}
