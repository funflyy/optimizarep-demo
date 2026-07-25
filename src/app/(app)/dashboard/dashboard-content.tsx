"use client";

import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PackageIcon,
  LayersIcon,
  WeightIcon,
  DollarSignIcon,
  TrendingUpIcon,
  RecycleIcon,
} from "lucide-react";
import { DashboardFilters } from "./dashboard-filters";
import { PomOverviewChart } from "./pom-overview-chart";
import { MaterialBreakdownTable } from "./material-breakdown-table";

interface Piece {
  materialClass: string;
  materialDetail: string;
  weightGrams: number;
  wasteType: string;
  isDomiciliary: boolean;
  salesYear: number | null;
  unitsSold: number | null;
}

interface DashboardContentProps {
  pieces: Piece[];
  productCount: number;
  tariffCount: number;
  systemCount: number;
  years: number[];
}

export function DashboardContent({
  pieces,
  productCount,
  tariffCount,
  systemCount,
  years,
}: DashboardContentProps) {
  const [year, setYear] = useState("all");
  const [segment, setSegment] = useState("all");

  // Filtrar piezas
  const filtered = useMemo(() => {
    return pieces.filter((pc) => {
      if (year !== "all" && pc.salesYear !== Number(year)) return false;
      if (segment === "dom" && !pc.isDomiciliary) return false;
      if (segment === "nodom" && pc.isDomiciliary) return false;
      return true;
    });
  }, [pieces, year, segment]);

  // Calcular KPIs filtrados
  const pieceCount = filtered.length;
  const totalWeightGrams = filtered.reduce((a, pc) => a + pc.weightGrams, 0);

  // POM por material — agrupado
  const pomByMaterial = useMemo(() => {
    const map = new Map<
      string,
      { materialClass: string; totalPieces: number; totalWeight: number; weights: number[] }
    >();
    for (const pc of filtered) {
      const existing = map.get(pc.materialClass);
      if (existing) {
        existing.totalPieces++;
        existing.totalWeight += pc.weightGrams;
        existing.weights.push(pc.weightGrams);
      } else {
        map.set(pc.materialClass, {
          materialClass: pc.materialClass,
          totalPieces: 1,
          totalWeight: pc.weightGrams,
          weights: [pc.weightGrams],
        });
      }
    }
    return Array.from(map.values())
      .map((m) => ({
        materialClass: m.materialClass,
        totalPieces: m.totalPieces,
        totalWeight: m.totalWeight,
        avgWeight: m.weights.length > 0 ? m.weights.reduce((a, b) => a + b, 0) / m.weights.length : 0,
      }))
      .sort((a, b) => b.totalWeight - a.totalWeight);
  }, [filtered]);

  // POM detallado — para la tabla
  const pomDetailed = useMemo(() => {
    const map = new Map<
      string,
      { materialClass: string; materialDetail: string; wasteType: string; pieceCount: number; totalWeightGrams: number }
    >();
    for (const pc of filtered) {
      const key = `${pc.materialClass}|${pc.materialDetail}|${pc.wasteType}`;
      const existing = map.get(key);
      if (existing) {
        existing.pieceCount++;
        existing.totalWeightGrams += pc.weightGrams;
      } else {
        map.set(key, {
          materialClass: pc.materialClass,
          materialDetail: pc.materialDetail,
          wasteType: pc.wasteType,
          pieceCount: 1,
          totalWeightGrams: pc.weightGrams,
        });
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => b.totalWeightGrams - a.totalWeightGrams
    );
  }, [filtered]);

  const isFiltered = year !== "all" || segment !== "all";

  return (
    <div className="space-y-8">
      {/* Header + Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Resumen de tu línea base REP — Envases y Embalajes
          </p>
        </div>
        <DashboardFilters
          years={years}
          year={year}
          segment={segment}
          onYearChange={setYear}
          onSegmentChange={setSegment}
        />
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Productos (SKUs)
            </CardTitle>
            <PackageIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{productCount}</div>
            <p className="text-xs text-muted-foreground">
              Registrados en el sistema
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Piezas{isFiltered ? " (filtradas)" : ""}
            </CardTitle>
            <LayersIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pieceCount}</div>
            <p className="text-xs text-muted-foreground">
              {isFiltered
                ? `De ${pieces.length} totales`
                : "Total de piezas declaradas"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Peso Total Envases
            </CardTitle>
            <WeightIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(totalWeightGrams / 1000).toFixed(1)} kg
            </div>
            <p className="text-xs text-muted-foreground">
              Peso unitario por producto (sin ventas)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Tarifas Cargadas
            </CardTitle>
            <DollarSignIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tariffCount}</div>
            <p className="text-xs text-muted-foreground">
              En {systemCount} Sistemas de Gestión
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts & Tables */}
      <div className="grid gap-6 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RecycleIcon className="h-5 w-5 text-emerald-600" />
              Distribución POM por Material
            </CardTitle>
            <CardDescription>
              Peso total de piezas agrupado por clasificación general
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            <PomOverviewChart data={pomByMaterial} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUpIcon className="h-5 w-5 text-blue-600" />
              Resumen por Material
            </CardTitle>
            <CardDescription>
              Peso y cantidad de piezas por tipo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pomByMaterial.map((m) => {
                const pct =
                  totalWeightGrams > 0
                    ? (m.totalWeight / totalWeightGrams) * 100
                    : 0;
                return (
                  <div key={m.materialClass} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{m.materialClass}</span>
                      <span className="text-muted-foreground">
                        {m.totalWeight.toFixed(0)}g ({pct.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {m.totalPieces} piezas · Peso prom.{" "}
                      {m.avgWeight.toFixed(1)}g
                    </p>
                  </div>
                );
              })}
              {pomByMaterial.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Sin datos para los filtros seleccionados
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Material Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Desglose por Clasificación Detallada</CardTitle>
          <CardDescription>
            Todos los materiales declarados con su peso total y tipo de residuo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MaterialBreakdownTable data={pomDetailed} />
        </CardContent>
      </Card>
    </div>
  );
}
