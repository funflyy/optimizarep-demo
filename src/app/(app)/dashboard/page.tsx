"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useProductType } from "@/hooks/use-product-type";
import { CustomSection } from "./custom-section";
import type { ChartConfig } from "@/lib/chart-types";
import type { Piece } from "@/lib/aggregate";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  WeightIcon,
  DollarSignIcon,
  TrendingUpIcon,
  BarChart3Icon,
  PackageIcon,
  ShieldAlertIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  XCircleIcon,
} from "lucide-react";

// ── Horizontal bar chart (pure CSS) ──
function HorizontalBarChart({
  data,
}: {
  data: { label: string; value: number; color: string }[];
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.label} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{d.label}</span>
            <span className="text-muted-foreground">
              UF {d.value.toLocaleString("es-CL")}
            </span>
          </div>
          <div className="h-6 w-full rounded bg-muted/30 overflow-hidden">
            <div
              className="h-full rounded transition-all duration-700"
              style={{
                width: `${(d.value / max) * 100}%`,
                backgroundColor: d.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Donut/Pie chart (pure SVG) ──
function PieChart({
  data,
}: {
  data: { label: string; value: number; color: string }[];
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let cumulative = 0;
  const size = 200;
  const center = size / 2;
  const radius = 80;

  const slices = data.map((d) => {
    const startAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
    cumulative += d.value;
    const endAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;

    const largeArc = d.value / total > 0.5 ? 1 : 0;
    const x1 = center + radius * Math.cos(startAngle);
    const y1 = center + radius * Math.sin(startAngle);
    const x2 = center + radius * Math.cos(endAngle);
    const y2 = center + radius * Math.sin(endAngle);

    return {
      ...d,
      path: `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`,
      pct: ((d.value / total) * 100).toFixed(1),
    };
  });

  return (
    <div className="flex items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((s) => (
          <path
            key={s.label}
            d={s.path}
            fill={s.color}
            stroke="hsl(var(--card))"
            strokeWidth="2"
          />
        ))}
      </svg>
      <div className="space-y-2 text-sm">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-sm flex-shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span>
              {s.label}{" "}
              <span className="text-muted-foreground">({s.pct}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Semáforo badge ──
function SemaphoreBadge({
  level,
  label,
}: {
  level: "ok" | "revisar" | "riesgo";
  label: string;
}) {
  const styles = {
    ok: {
      icon: <CheckCircle2Icon className="h-8 w-8" />,
      text: "OK",
      className: "text-emerald-500",
      border: "border-emerald-500/30 bg-emerald-500/5",
    },
    revisar: {
      icon: <AlertTriangleIcon className="h-8 w-8" />,
      text: "REVISAR",
      className: "text-amber-500",
      border: "border-amber-500/30 bg-amber-500/5",
    },
    riesgo: {
      icon: <XCircleIcon className="h-8 w-8" />,
      text: "RIESGO",
      className: "text-red-500",
      border: "border-red-500/30 bg-red-500/5",
    },
  };

  const s = styles[level];
  return (
    <Card className={s.border}>
      <CardContent className="flex flex-col items-center justify-center py-4 gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <div className={s.className}>{s.icon}</div>
        <p className={`text-lg font-bold ${s.className}`}>{s.text}</p>
        <p className="text-xs text-muted-foreground text-center">
          {level === "ok"
            ? "Todas al día"
            : level === "revisar"
              ? "Requiere atención"
              : "Pendientes vencidas"}
        </p>
      </CardContent>
    </Card>
  );
}

// ── Color palette for materials ──
const MATERIAL_COLORS: Record<string, string> = {
  Plástico: "#3b82f6",
  "Plásticos": "#3b82f6",
  "Papel/Cartón": "#f59e0b",
  Celulosa: "#f59e0b",
  Vidrio: "#10b981",
  Metal: "#8b5cf6",
  Metales: "#8b5cf6",
  "Cart. Líquidos": "#06b6d4",
  Otros: "#6b7280",
};

function getColor(material: string, index: number) {
  return (
    MATERIAL_COLORS[material] ??
    ["#3b82f6", "#f59e0b", "#10b981", "#8b5cf6", "#06b6d4", "#ef4444"][
      index % 6
    ]
  );
}

// ═══════════════════════════════════════════════════════════════
// ProductSection — Sección auto-contenida por tipo de producto
// ═══════════════════════════════════════════════════════════════
function ProductSection({ productType, segment, year, systemName, title }: {
  productType: string;
  segment: "all" | "dom" | "nodom";
  year?: number;
  systemName?: string;
  title?: { label: string; emoji: string; color: string };
}) {
  const costFilter = useMemo(() => ({
    isDomiciliary: segment === "all" ? undefined : segment === "dom",
    productType,
    year,
    systemName: systemName || undefined,
  }), [segment, productType, year, systemName]);

  const { data: summary, isLoading: summaryLoading } =
    trpc.costs.summary.useQuery(costFilter);
  const { data: byMaterial } = trpc.costs.byMaterial.useQuery(costFilter);
  const { data: products } = trpc.product.list.useQuery({ limit: 100 });

  // Filtrar productos por tipo
  const typeProducts = useMemo(() =>
    (products?.products ?? []).filter((p: any) => (p.productType ?? "envases_embalajes") === productType),
    [products, productType]
  );

  const totalProducts = typeProducts.length;
  const withSales = typeProducts.filter((p: any) => p.salesRecords?.length > 0).length;
  const allPieces = typeProducts.flatMap((p: any) => p.pieces ?? []);
  const nonRecyclable = allPieces.filter((p: any) => p.wasteType === "non_recyclable").length;

  const declaracionLevel: "ok" | "revisar" | "riesgo" =
    totalProducts === 0 ? "ok" : withSales === totalProducts ? "ok" : withSales > totalProducts * 0.7 ? "revisar" : "riesgo";
  const clasificacionLevel: "ok" | "revisar" | "riesgo" =
    nonRecyclable === 0 ? "ok" : nonRecyclable <= 10 ? "revisar" : "riesgo";
  const auditoriaLevel: "ok" | "revisar" | "riesgo" = "ok";

  const riskLabel =
    declaracionLevel === "riesgo" || clasificacionLevel === "riesgo"
      ? "ALTO"
      : declaracionLevel === "revisar" || clasificacionLevel === "revisar"
        ? "MEDIO"
        : "BAJO";

  const chartCostData = useMemo(() => {
    if (!byMaterial?.data) return [];
    return byMaterial.data.map((m, i) => {
      // Costo real del material: suma de lo que cada productor paga a su SIG activo
      const totalCost = Object.values(m.costsBySig).reduce((a, b) => a + b, 0);
      return {
        label: m.material,
        value: Math.round(totalCost * 100) / 100,
        color: getColor(m.material, i),
      };
    });
  }, [byMaterial]);

  const chartTonData = useMemo(() => {
    if (!byMaterial?.data) return [];
    return byMaterial.data.map((m, i) => ({
      label: m.material, value: m.tons, color: getColor(m.material, i),
    }));
  }, [byMaterial]);

  const topSkuCount = summary?.skuCount ?? 0;

  return (
    <div className="space-y-6">
      {/* Título con barra de color (solo en vista "Todos") */}
      {title && (
        <div className="flex items-center gap-3 pt-2">
          <div className="w-1 h-8 rounded-full" style={{ backgroundColor: title.color }} />
          <span className="text-xl">{title.emoji}</span>
          <h2 className="text-xl font-bold tracking-tight">{title.label}</h2>
          <span className="text-sm text-muted-foreground ml-auto">{totalProducts} productos</span>
        </div>
      )}

      {/* 6 KPIs */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Ton. Mercado</CardTitle>
            <WeightIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">
              {summaryLoading ? "..." : `${(summary?.totalTons ?? 0).toLocaleString("es-CL")} ton`}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Costo REP (UF)</CardTitle>
            <DollarSignIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">
              {summaryLoading ? "..." : `UF ${(summary?.totalCostUf ?? 0).toLocaleString("es-CL")}`}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Variación Anual</CardTitle>
            <TrendingUpIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-muted-foreground">—</div>
            <p className="text-[10px] text-muted-foreground">vs año anterior</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Material Mayor Costo</CardTitle>
            <BarChart3Icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">
              {summaryLoading ? "..." : summary?.topMaterial ?? "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">SKUs con Mayor Costo</CardTitle>
            <PackageIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">
              {summaryLoading ? "..." : `${topSkuCount} SKUs`}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Riesgo Regulatorio</CardTitle>
            <ShieldAlertIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-xl font-bold ${
              riskLabel === "ALTO" ? "text-red-500" : riskLabel === "MEDIO" ? "text-amber-500" : "text-emerald-500"
            }`}>
              {riskLabel}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 2 Gráficos */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3Icon className="h-5 w-5 text-blue-500" />
              Costo REP por Material
            </CardTitle>
            <CardDescription>Costo en UF por clasificación de material</CardDescription>
          </CardHeader>
          <CardContent>
            {chartCostData.length > 0 ? (
              <HorizontalBarChart data={chartCostData} />
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">Sin datos de costos</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WeightIcon className="h-5 w-5 text-emerald-500" />
              Toneladas por Material
            </CardTitle>
            <CardDescription>Distribución del peso declarado (%)</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            {chartTonData.length > 0 ? (
              <PieChart data={chartTonData} />
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">Sin datos</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 3 Semáforos */}
      <div className="grid gap-4 md:grid-cols-3">
        <SemaphoreBadge level={declaracionLevel} label="Declaraciones" />
        <SemaphoreBadge level={clasificacionLevel} label="Clasificaciones" />
        <SemaphoreBadge level={auditoriaLevel} label="Auditorías" />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DashboardPage — Página principal
// ═══════════════════════════════════════════════════════════════
function DashboardCustomCharts({ segment, productType }: { segment: "all" | "dom" | "nodom"; productType: string | null }) {
  const { data: chartRows } = trpc.dashboardCharts.list.useQuery();
  const { data: products, error: prodError, isLoading: prodLoading } = trpc.product.list.useQuery({
    limit: 100,
    productType: productType ?? undefined,
  });

  const pieces: Piece[] = useMemo(() => {
    if (!products?.products) return [];
    const result = products.products.flatMap((p: any) =>
      (p.pieces ?? []).flatMap((piece: any) =>
        (p.salesRecords ?? [{ year: null, unitsSold: null }]).map((sr: any) => ({
          materialClass: piece.materialClass ?? "",
          materialDetail: piece.materialDetail ?? "",
          weightGrams: piece.weightGrams ?? 0,
          wasteType: piece.wasteType ?? "recyclable",
          isDomiciliary: piece.isDomiciliary ?? true,
          salesYear: sr.year ?? null,
          unitsSold: sr.unitsSold ?? null,
        }))
      )
    );
    // ponytail: debug log, remove when confirmed working
    console.log("[CustomCharts] products:", products.products.length, "pieces:", result.length, "sample:", result[0]);
    return result;
  }, [products]);

  const filtered = useMemo(() => {
    if (segment === "all") return pieces;
    return pieces.filter((p) =>
      segment === "dom" ? p.isDomiciliary : !p.isDomiciliary
    );
  }, [pieces, segment]);

  const configs: ChartConfig[] = useMemo(() => {
    if (!chartRows) return [];
    return chartRows.map((c) => ({
      id: c.id,
      name: c.name,
      chartType: c.chartType as ChartConfig["chartType"],
      dimension: c.dimension as ChartConfig["dimension"],
      metric: (c.aggregation === "count" ? "pieces" : c.metric) as ChartConfig["metric"],
      aggregation: c.aggregation as ChartConfig["aggregation"],
      filters: c.filters as ChartConfig["filters"],
    }));
  }, [chartRows]);

  return (
    <>
      <p className="text-xs text-muted-foreground p-2 border rounded bg-muted/30">
        DEBUG: {prodLoading ? "loading..." : prodError ? `ERROR: ${prodError.message}` : `${products?.products?.length} products`}, {pieces.length} pieces, {configs.length} charts
      </p>
      <CustomSection configs={configs} pieces={filtered} />
    </>
  );
}

export default function DashboardPage() {
  const [segment, setSegment] = useState<"all" | "dom" | "nodom">("all");
  const [year, setYear] = useState<number | undefined>(undefined);
  const [systemName, setSystemName] = useState<string>("");

  // El producto prioritario activo viene del selector del sidebar
  const productType = useProductType();

  // Años disponibles y sistemas (del producto prioritario activo)
  const { data: filters } = trpc.costs.availableFilters.useQuery({
    productType: productType ?? undefined,
  });
  const availableYears = filters?.years ?? [];
  const availableSystems = filters?.systems ?? [];

  // Sin opción "Todos": el primer sistema disponible queda seleccionado
  // por defecto (también al cambiar de producto si el actual ya no existe)
  useEffect(() => {
    if (availableSystems.length > 0 && !availableSystems.includes(systemName)) {
      setSystemName(availableSystems[0]);
    }
  }, [availableSystems, systemName]);

  return (
    <div className="space-y-8">
      {/* Header + Filtros */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Resumen Ejecutivo
            </h1>
            <p className="text-muted-foreground mt-1">
              ¿Cuánto me costará REP este año?
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Selector Año */}
            <select
              value={year ?? ""}
              onChange={(e) => setYear(e.target.value ? Number(e.target.value) : undefined)}
              className="h-9 rounded-lg border bg-muted/30 px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none cursor-pointer"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', paddingRight: '28px' }}
            >
              <option value="">Todos los años</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            {/* Selector Sistema */}
            <select
              value={systemName}
              onChange={(e) => setSystemName(e.target.value)}
              className="h-9 rounded-lg border bg-muted/30 px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none cursor-pointer"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', paddingRight: '28px' }}
            >
              {availableSystems.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <div className="flex items-center gap-1 rounded-lg border p-1 bg-muted/30">
              <button
                onClick={() => setSegment("all")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  segment === "all"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setSegment("dom")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  segment === "dom"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Domiciliario
              </button>
              <button
                onClick={() => setSegment("nodom")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  segment === "nodom"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                No Domiciliario
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Contenido — filtrado por el producto prioritario del sidebar */}
      {productType ? (
        <ProductSection
          productType={productType}
          segment={segment}
          year={year}
          systemName={systemName}
        />
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Selecciona un producto prioritario
          </CardContent>
        </Card>
      )}

      {/* Widgets configurables */}
      <DashboardCustomCharts segment={segment} productType={productType} />
    </div>
  );
}

