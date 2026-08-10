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
import { MonthFilter, monthFilters } from "@/components/month-filter";
import {
  TrendingDownIcon,
  SparklesIcon,
  LeafIcon,
  ScaleIcon,
  RecycleIcon,
} from "lucide-react";

const num = (n: number, d = 2) =>
  n.toLocaleString("es-CL", { minimumFractionDigits: d, maximumFractionDigits: d });

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
  const [month, setMonth] = useState<string>("all");
  const productType = useProductType();

  const filters = useMemo(
    () => ({
      year: year !== "all" ? Number(year) : undefined,
      ...monthFilters(month),
      productType: productType ?? undefined,
      limit: 20,
    }),
    [year, month, productType]
  );

  const { data: filterOptions } = trpc.costs.availableFilters.useQuery({
    productType: productType ?? undefined,
  });
  const { data: topSkus, isLoading } = trpc.costs.topSkus.useQuery(filters);
  const { data: opp, isLoading: loadingOpp } =
    trpc.costs.opportunities.useQuery(filters);

  const items = opp?.items ?? [];

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
          <MonthFilter
            value={month}
            onChange={setMonth}
            months={filterOptions?.months ?? []}
          />
        </div>
      </div>

      {/* ── Potencial total ── */}
      {opp && opp.totalItems > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardHeader className="pb-2">
              <CardDescription>Ahorro potencial identificado</CardDescription>
              <CardTitle className="text-3xl text-emerald-600 dark:text-emerald-400">
                {num(opp.totals.combinedSavingsUf)} UF
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {num(opp.totals.combinedPct, 1)}% de las{" "}
                {num(opp.referenceCostUf)} UF que cuesta hoy tu portafolio en{" "}
                {opp.referenceSystem}. Aligerar y sustituir se combinan sobre la
                misma pieza, así que el total no es la suma de las filas.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <RecycleIcon className="h-3.5 w-3.5" />
                Por sustitución de material
              </CardDescription>
              <CardTitle className="text-2xl">
                {num(opp.totals.materialUf)} UF
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Diferencia real de tarifa entre materiales de la misma clase,
                según las tarifas {opp.tariffYear} de {opp.referenceSystem}.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <ScaleIcon className="h-3.5 w-3.5" />
                Por reducción de gramaje
              </CardDescription>
              <CardTitle className="text-2xl">
                {num(opp.totals.gramajeUf)} UF
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Llevar cada pieza a la mediana de tus propias piezas
                equivalentes. {opp.cohorts} grupos con muestra suficiente.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

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
        <CardContent className="overflow-x-auto">
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
                      {num(row.tons)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {num(row.costUf)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── TABLA 2: Ranking de oportunidades ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SparklesIcon className="h-5 w-5 text-amber-500" />
            Ranking de Oportunidades de Ecodiseño
          </CardTitle>
          <CardDescription>
            {opp?.referenceSystem
              ? `Cada fila apunta a una pieza concreta y muestra el dato que sostiene el ahorro. Tarifas ${opp.tariffYear} de ${opp.referenceSystem}.`
              : "Cada fila apunta a una pieza concreta y muestra el dato que sostiene el ahorro."}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loadingOpp ? (
            <p className="text-sm text-muted-foreground py-4 animate-pulse">
              Buscando alternativas...
            </p>
          ) : items.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-muted-foreground">
                No se detectaron oportunidades con los datos actuales.
              </p>
              <p className="text-xs text-muted-foreground mt-2 max-w-xl mx-auto">
                Se necesitan tarifas mapeadas para comparar materiales, y al
                menos 4 piezas equivalentes para comparar gramajes. Si el
                catálogo es chico o el mapeo está incompleto, no hay con qué
                comparar.
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>SKU / Pieza</TableHead>
                    <TableHead>Acción</TableHead>
                    <TableHead>Por qué</TableHead>
                    <TableHead className="text-right">Ahorro (UF)</TableHead>
                    <TableHead className="text-right">%</TableHead>
                    <TableHead>Prioridad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row) => (
                    <TableRow key={`${row.sku}-${row.pieceName}-${row.kind}`}>
                      <TableCell className="text-muted-foreground font-mono">
                        {row.rank}
                      </TableCell>
                      <TableCell>
                        <p className="font-mono text-xs">{row.sku}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.pieceName} · {row.segment}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-start gap-1.5">
                          {row.kind === "material" ? (
                            <RecycleIcon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500" />
                          ) : (
                            <ScaleIcon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-violet-500" />
                          )}
                          <span className="text-sm">{row.action}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-md">
                        {row.evidence}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        {num(row.savingsUf)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {num(row.savingsPct, 1)}%
                      </TableCell>
                      <TableCell>
                        <PriorityBadge priority={row.priority} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {opp && opp.totalItems > items.length && (
                <p className="text-xs text-muted-foreground mt-3">
                  Mostrando las {items.length} de mayor ahorro, de{" "}
                  {opp.totalItems} detectadas.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Cómo leer esto */}
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="py-6">
          <div className="flex items-start gap-3">
            <LeafIcon className="h-6 w-6 text-amber-500 mt-0.5" />
            <div className="space-y-2">
              <p className="font-semibold">Cómo se calcula</p>
              <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside">
                <li>
                  <strong>Sustituir material</strong>: la diferencia real de
                  tarifa entre el material de la pieza y el más barato de su
                  misma clase, en el mismo segmento y SIG. Solo se propone
                  dentro de la familia: un film de PS se compara con otros
                  plásticos, no con una lata de aluminio.
                </li>
                <li>
                  <strong>Bajar gramaje</strong>: llevar la pieza a la mediana de
                  tus piezas equivalentes. Es tu propio dato, así que la meta ya
                  la cumple más de la mitad de tu catálogo.
                </li>
                <li>
                  <strong>Prioridad</strong>: cuánto pesa el ahorro en tu factura
                  REP total. Alta sobre 1%, Media sobre 0,25%.
                </li>
                <li>
                  Las piezas <strong>sin tarifa mapeada</strong> no aparecen: sin
                  costo no hay ahorro calculable. Se revisan en{" "}
                  <strong>Riesgos</strong>.
                </li>
                <li>
                  Usa el <strong>Simulador</strong> para verificar cada cambio
                  sobre el SKU y guardarlo como escenario.
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
