"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

import { wasteColor } from "@/lib/brand";

interface PomData {
  materialClass: string;
  totalPieces: number;
  avgWeight: number;
  totalWeight: number;
}

export function PomOverviewChart({ data }: { data: PomData[] }) {
  const chartData = data.map((d) => ({
    name: d.materialClass,
    peso: Number(d.totalWeight),
    piezas: d.totalPieces,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={chartData}
        margin={{ top: 5, right: 10, left: 10, bottom: 20 }}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 12 }}
          angle={-15}
          textAnchor="end"
          className="fill-muted-foreground"
        />
        <YAxis
          tick={{ fontSize: 12 }}
          className="fill-muted-foreground"
          label={{
            value: "Peso (g)",
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
          formatter={(value, name) => {
            if (name === "peso" && typeof value === "number")
              return [`${value.toFixed(0)}g`, "Peso total"];
            return [value ?? "", String(name ?? "")];
          }}
        />
        <Bar dataKey="peso" radius={[6, 6, 0, 0]} barSize={48}>
          {chartData.map((d, index) => (
            <Cell key={index} fill={wasteColor(d.name, index)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
