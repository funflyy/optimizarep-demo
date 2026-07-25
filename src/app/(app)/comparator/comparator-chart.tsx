"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const SIG_COLORS: Record<string, string> = {
  ReSimple: "#10b981",
  Giro: "#3b82f6",
  COREIGN: "#f59e0b",
  ProREP: "#8b5cf6",
  Chilerecicla: "#ec4899",
};

interface ComparisonRow {
  material: string;
  rates: Record<string, number | null>;
}

interface ComparatorChartProps {
  data: ComparisonRow[];
  sigNames: string[];
}

export function ComparatorChart({ data, sigNames }: ComparatorChartProps) {
  // Tomar los primeros 12 materiales que tienen al menos 2 SIGs con datos
  const chartData = data
    .filter((d) => {
      const validRates = sigNames.filter(
        (n) => d.rates[n] !== null && d.rates[n] !== undefined
      );
      return validRates.length >= 2;
    })
    .slice(0, 12)
    .map((d) => {
      const row: Record<string, unknown> = { name: d.material };
      sigNames.forEach((sig) => {
        row[sig] = d.rates[sig] !== null ? Number(d.rates[sig]) : null;
      });
      return row;
    });

  if (chartData.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={chartData}
        margin={{ top: 5, right: 10, left: 10, bottom: 40 }}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11 }}
          angle={-25}
          textAnchor="end"
          className="fill-muted-foreground"
          interval={0}
        />
        <YAxis
          tick={{ fontSize: 12 }}
          className="fill-muted-foreground"
          label={{
            value: "UF/Ton",
            angle: -90,
            position: "insideLeft",
            className: "fill-muted-foreground",
          }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "13px",
          }}
          formatter={(value) => [
            (typeof value === "number" ? value.toFixed(2) : String(value ?? "")) + " UF/Ton",
          ]}
        />
        <Legend />
        {sigNames
          .filter((n) => chartData.some((d) => d[n] !== null))
          .map((sig) => (
            <Bar
              key={sig}
              dataKey={sig}
              fill={SIG_COLORS[sig] || "#64748b"}
              radius={[4, 4, 0, 0]}
              barSize={20}
            />
          ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
