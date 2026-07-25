import { db } from "@/server/db";
import {
  managementSystems,
  tariffCategories,
  tariffs,
} from "@/server/db/schema";
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
import { GitCompareArrowsIcon } from "lucide-react";
import { ComparatorChart } from "./comparator-chart";
import { getActivePriorityProduct } from "@/lib/priority-product-server";

export default async function ComparatorPage() {
  // SIG activos del producto prioritario seleccionado en el sidebar
  const pp = await getActivePriorityProduct();
  const systems = await db.query.managementSystems.findMany({
    where: (s, { eq, and }) =>
      and(
        eq(s.isActive, true),
        pp
          ? eq(s.priorityProductId, pp.id)
          : eq(s.priorityProduct, "Envases y Embalajes")
      ),
    with: {
      tariffCategories: {
        with: { tariffs: true },
      },
    },
  });

  // Construir mapa: subcategoría → { sigName: rate }
  const comparisonMap = new Map<
    string,
    { segment: string; material: string; rates: Record<string, number | null> }
  >();

  for (const sys of systems) {
    for (const cat of sys.tariffCategories) {
      const t2026 = cat.tariffs.find((t) => t.year === 2026);
      const key = `${cat.segment}|${cat.subcategory}`;

      if (!comparisonMap.has(key)) {
        comparisonMap.set(key, {
          segment: cat.segment,
          material: cat.subcategory,
          rates: {},
        });
      }
      comparisonMap.get(key)!.rates[sys.name] = t2026
        ? Number(t2026.rateUfPerTon)
        : null;
    }
  }

  const comparisons = Array.from(comparisonMap.values()).sort((a, b) =>
    a.material.localeCompare(b.material)
  );

  const sigNames = systems.map((s) => s.name);

  // Separar por segmento
  const domiciliary = comparisons.filter(
    (c) => c.segment === "Domiciliario"
  );
  const nonDomiciliary = comparisons.filter(
    (c) => c.segment !== "Domiciliario"
  );

  function renderTable(
    rows: typeof comparisons,
    title: string,
    desc: string
  ) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription>{desc}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material / Subcategoría</TableHead>
                {sigNames.map((name) => (
                  <TableHead key={name} className="text-right">
                    {name}
                  </TableHead>
                ))}
                <TableHead className="text-right">Diferencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => {
                const validRates = sigNames
                  .map((n) => row.rates[n])
                  .filter((r): r is number => r !== null && r !== undefined);
                const min = validRates.length ? Math.min(...validRates) : null;
                const max = validRates.length ? Math.max(...validRates) : null;
                const diff =
                  min !== null && max !== null && min > 0
                    ? (((max - min) / min) * 100).toFixed(0)
                    : null;

                return (
                  <TableRow key={i}>
                    <TableCell className="font-medium">
                      {row.material}
                    </TableCell>
                    {sigNames.map((name) => {
                      const rate = row.rates[name];
                      const isMin = rate !== null && rate === min;
                      return (
                        <TableCell
                          key={name}
                          className={`text-right font-mono ${
                            isMin
                              ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                              : ""
                          }`}
                        >
                          {rate !== null && rate !== undefined
                            ? Number(rate).toFixed(2)
                            : "—"}
                          {isMin && validRates.length > 1 && (
                            <span className="ml-1 text-xs">✓</span>
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right">
                      {diff !== null ? (
                        <Badge
                          variant="outline"
                          className={
                            Number(diff) > 30
                              ? "text-amber-600 border-amber-300 dark:text-amber-400"
                              : "text-muted-foreground"
                          }
                        >
                          {diff}%
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  // Calcular ahorro potencial: diferencia promedio entre max y min
  const savingsData = comparisons
    .map((c) => {
      const rates = sigNames
        .map((n) => c.rates[n])
        .filter((r): r is number => r !== null && r !== undefined);
      if (rates.length < 2) return null;
      const min = Math.min(...rates);
      const max = Math.max(...rates);
      return { material: c.material, savings: max - min, pct: min > 0 ? ((max - min) / max) * 100 : 0 };
    })
    .filter(Boolean) as { material: string; savings: number; pct: number }[];

  const avgSavings = savingsData.length
    ? savingsData.reduce((a, s) => a + s.pct, 0) / savingsData.length
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Comparador de Costos
        </h1>
        <p className="text-muted-foreground mt-1">
          Comparación lado a lado de tarifas 2026 entre Sistemas de Gestión
          (UF/Ton). El valor más bajo se marca en{" "}
          <span className="text-emerald-600 font-semibold">verde ✓</span>
        </p>
      </div>

      {/* Savings Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              SIGs Comparados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sigNames.length}</div>
            <p className="text-xs text-muted-foreground">{sigNames.join(", ")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Subcategorías Comparables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{savingsData.length}</div>
            <p className="text-xs text-muted-foreground">
              Con datos en 2+ SIGs
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ahorro Promedio Potencial
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {avgSavings.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Eligiendo el SIG más económico por categoría
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      {domiciliary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Comparación Visual — Domiciliario</CardTitle>
            <CardDescription>
              Materiales con datos en al menos 2 Sistemas de Gestión
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ComparatorChart data={domiciliary} sigNames={sigNames} />
          </CardContent>
        </Card>
      )}

      {domiciliary.length > 0 &&
        renderTable(
          domiciliary,
          "Segmento Domiciliario",
          `${domiciliary.length} subcategorías comparadas entre ${sigNames.join(", ")}`
        )}

      {nonDomiciliary.length > 0 &&
        renderTable(
          nonDomiciliary,
          "Segmento No Domiciliario",
          `${nonDomiciliary.length} subcategorías`
        )}
    </div>
  );
}
