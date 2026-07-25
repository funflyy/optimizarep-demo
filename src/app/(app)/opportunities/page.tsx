"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useProductType } from "@/hooks/use-product-type";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  TrendingDownIcon,
  SparklesIcon,
  LeafIcon,
} from "lucide-react";

// ── Tipos ──
interface OpportunityRow {
  rank: number;
  sku: string;
  productName: string;
  opportunity: string;
  savingsUf: number;
  priority: "Alta" | "Media" | "Baja";
}

// ── Heurística de oportunidades de ahorro ──
function generateOpportunities(
  topSkus: Array<{
    sku: string;
    productName: string;
    materialClass: string;
    tons: number;
    costUf: number;
  }>,
  sigCosts: Array<{ systemName: string; costUf: number }> | undefined
): OpportunityRow[] {
  // SIG más barato vs más caro
  const cheapestSig = sigCosts?.[0]?.systemName ?? "Giro";
  const mostExpensiveSig =
    sigCosts && sigCosts.length > 1
      ? sigCosts[sigCosts.length - 1].systemName
      : "ReSimple";
  const sigDiffPct =
    sigCosts && sigCosts.length > 1
      ? (sigCosts[sigCosts.length - 1].costUf - sigCosts[0].costUf) /
        sigCosts[sigCosts.length - 1].costUf
      : 0.15;

  const opportunities: OpportunityRow[] = [];

  for (const sku of topSkus) {
    // Regla 1: Materiales no reciclables → cambiar material
    const isNonRecyclable = ["PVC", "PS", "EPS"].some((m) =>
      sku.materialClass.toUpperCase().includes(m)
    );

    // Regla 2: Material pesado → reducir gramaje
    const isHeavy = sku.tons > 50;

    // Regla 3: Costo alto → migrar SIG
    const isExpensive = sku.costUf > 100;

    let opportunity: string;
    let savingsUf: number;
    let priority: "Alta" | "Media" | "Baja";

    if (isNonRecyclable) {
      // Cambiar a material reciclable (~20-30% ahorro)
      const pct = 0.25;
      savingsUf = Math.round(sku.costUf * pct * 100) / 100;
      opportunity = `Cambiar ${sku.materialClass} → PET/PP`;
      priority = savingsUf > 100 ? "Alta" : savingsUf > 30 ? "Media" : "Baja";
    } else if (isHeavy && isExpensive) {
      // Reducir gramaje (~15% ahorro)
      const pct = 0.15;
      savingsUf = Math.round(sku.costUf * pct * 100) / 100;
      opportunity = "Reducir gramaje";
      priority = savingsUf > 100 ? "Alta" : savingsUf > 30 ? "Media" : "Baja";
    } else if (isExpensive && sigDiffPct > 0.1) {
      // Migrar SIG (~diferencia entre SIGs)
      savingsUf = Math.round(sku.costUf * sigDiffPct * 100) / 100;
      opportunity = `Migrar a ${cheapestSig}`;
      priority = savingsUf > 100 ? "Alta" : savingsUf > 30 ? "Media" : "Baja";
    } else if (sku.tons > 20) {
      // Eliminar embalaje secundario
      const pct = 0.1;
      savingsUf = Math.round(sku.costUf * pct * 100) / 100;
      opportunity = "Eliminar embalaje";
      priority = savingsUf > 50 ? "Media" : "Baja";
    } else {
      // Optimizar peso / estandarizar
      const pct = 0.08;
      savingsUf = Math.round(sku.costUf * pct * 100) / 100;
      const ops = [
        "Optimizar peso tapa",
        "Rediseñar tapa",
        "Estandarizar formato",
        "Reducir espesor",
        "Diseño monomaterial",
        "Cambiar proveedor",
      ];
      opportunity = ops[Math.abs(sku.sku.charCodeAt(sku.sku.length - 1)) % ops.length];
      priority = "Baja";
    }

    opportunities.push({
      rank: 0,
      sku: sku.sku,
      productName: sku.productName,
      opportunity,
      savingsUf,
      priority,
    });
  }

  // Ordenar por ahorro descendente y asignar ranking
  opportunities.sort((a, b) => b.savingsUf - a.savingsUf);
  opportunities.forEach((o, i) => (o.rank = i + 1));

  return opportunities;
}

// ── Prioridad badge ──
function PriorityBadge({ priority }: { priority: "Alta" | "Media" | "Baja" }) {
  const styles = {
    Alta: "bg-red-500",
    Media: "bg-amber-500",
    Baja: "bg-emerald-500",
  };
  return (
    <div className="flex items-center gap-2">
      <div className={`h-3 w-3 rounded-full ${styles[priority]}`} />
      <span className="text-sm">{priority}</span>
    </div>
  );
}

export default function OpportunitiesPage() {
  const [year, setYear] = useState<string>("all");
  const productType = useProductType();

  const filters = useMemo(
    () => ({
      year: year !== "all" ? Number(year) : undefined,
      productType: productType ?? undefined,
      limit: 20,
    }),
    [year, productType]
  );

  const { data: filterOptions } = trpc.costs.availableFilters.useQuery({
    productType: productType ?? undefined,
  });
  const { data: topSkus, isLoading } = trpc.costs.topSkus.useQuery(filters);
  const { data: summary } = trpc.costs.summary.useQuery({
    year: year !== "all" ? Number(year) : undefined,
    productType: productType ?? undefined,
  });

  // Generar oportunidades
  const opportunities = useMemo(() => {
    if (!topSkus || topSkus.length === 0) return [];
    return generateOpportunities(topSkus, summary?.costBySig);
  }, [topSkus, summary]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Oportunidades de Ahorro
          </h1>
          <p className="text-muted-foreground mt-1">
            ¿Dónde puedo ahorrar en mi costo REP?
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Año" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {filterOptions?.years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── TABLA 1: Top 20 SKUs Más Caros ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDownIcon className="h-5 w-5 text-blue-500" />
            Top 20 SKUs Más Caros
            <span className="text-sm font-normal text-muted-foreground">
              (por costo REP total)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4 animate-pulse">
              Calculando...
            </p>
          ) : (topSkus?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Sin datos de costos. Verifica mapeos de tarifas.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Ton.</TableHead>
                  <TableHead className="text-right">Costo UF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topSkus?.map((row, i) => (
                  <TableRow key={row.sku}>
                    <TableCell className="text-muted-foreground font-mono">
                      {i + 1}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.sku}
                    </TableCell>
                    <TableCell>{row.productName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.materialClass}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {row.tons.toLocaleString("es-CL")}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {row.costUf.toLocaleString("es-CL")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── TABLA 2: Top 20 SKUs con Mayor Potencial de Ahorro ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SparklesIcon className="h-5 w-5 text-amber-500" />
            Top 20 SKUs con Mayor Potencial de Ahorro
            <span className="text-sm font-normal text-muted-foreground">
              (ecodiseño o cambio SIG)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {opportunities.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Sin datos para generar oportunidades.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Oportunidad</TableHead>
                  <TableHead className="text-right">
                    Ahorro Est. (UF)
                  </TableHead>
                  <TableHead>Prioridad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {opportunities.map((row) => (
                  <TableRow key={row.sku}>
                    <TableCell className="text-muted-foreground font-mono">
                      {row.rank}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.sku}
                    </TableCell>
                    <TableCell>{row.productName}</TableCell>
                    <TableCell>
                      <span className="text-sm">{row.opportunity}</span>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-emerald-500">
                      {row.savingsUf.toLocaleString("es-CL")}
                    </TableCell>
                    <TableCell>
                      <PriorityBadge priority={row.priority} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Insight */}
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="py-6">
          <div className="flex items-start gap-3">
            <LeafIcon className="h-6 w-6 text-amber-500 mt-0.5" />
            <div>
              <p className="font-semibold">Estrategia de Ecodiseño</p>
              <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                <li>
                  <strong>Reducir gramaje</strong>: Menos peso = menos toneladas
                  = menos costo REP.
                </li>
                <li>
                  <strong>Cambiar material</strong>: PET y cartón tienen tarifas
                  más bajas que PVC o PS.
                </li>
                <li>
                  <strong>Migrar SIG</strong>: Compara costos entre Giro,
                  ReSimple y ProREP para tu mix de materiales.
                </li>
                <li>
                  <strong>Usa el Simulador</strong>: Para calcular el impacto
                  exacto de cada cambio sobre un SKU específico.
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
