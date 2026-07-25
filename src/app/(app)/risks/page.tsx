"use client";

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  ShieldAlertIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  XCircleIcon,
  ClockIcon,
  PackageSearchIcon,
} from "lucide-react";

/**
 * Semáforo de riesgo:
 * 🟢 Verde: OK, sin riesgo
 * 🟡 Amarillo: Atención, riesgo menor
 * 🔴 Rojo: Crítico, acción requerida
 */
type RiskLevel = "green" | "yellow" | "red";

interface RiskItem {
  name: string;
  status: string;
  level: RiskLevel;
  detail: string;
}

function RiskBadge({ level }: { level: RiskLevel }) {
  switch (level) {
    case "green":
      return (
        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
          <CheckCircle2Icon className="h-3 w-3 mr-1" />
          OK
        </Badge>
      );
    case "yellow":
      return (
        <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">
          <ClockIcon className="h-3 w-3 mr-1" />
          Atención
        </Badge>
      );
    case "red":
      return (
        <Badge className="bg-red-500/10 text-red-500 border-red-500/20">
          <XCircleIcon className="h-3 w-3 mr-1" />
          Crítico
        </Badge>
      );
  }
}

export default function RisksPage() {
  const productType = useProductType();
  const { data: products } = trpc.product.list.useQuery({
    limit: 100,
    productType: productType ?? undefined,
  });
  const { data: summary } = trpc.costs.summary.useQuery({
    productType: productType ?? undefined,
  });
  const { data: filters } = trpc.costs.availableFilters.useQuery({
    productType: productType ?? undefined,
  });

  // ── Análisis de Riesgos ──
  const allProducts = products?.products ?? [];
  const totalProducts = allProducts.length;
  const productsWithSales = allProducts.filter(
    (p: any) => p.salesRecords?.length > 0
  ).length;
  const productsWithoutSales = totalProducts - productsWithSales;

  // SKUs con costo calculado vs. total
  const skusWithCost = summary?.skuCount ?? 0;
  const skusWithoutCost = totalProducts - skusWithCost;

  // Piezas con materiales no reciclables
  const allPieces = allProducts.flatMap((p: any) => p.pieces ?? []);
  const nonRecyclablePieces = allPieces.filter(
    (p: any) => p.wasteType === "non_recyclable"
  );
  const hazardousPieces = allPieces.filter((p: any) => p.isHazardous);
  const greasePieces = allPieces.filter((p: any) => p.hasGrease);

  // ── Construir semáforo ──
  const risks: RiskItem[] = [
    {
      name: "Declaración SINADER",
      status:
        productsWithSales === totalProducts
          ? "Todos los SKUs tienen ventas declaradas"
          : `${productsWithoutSales} SKUs sin ventas`,
      level:
        productsWithoutSales === 0
          ? "green"
          : productsWithoutSales <= 3
            ? "yellow"
            : "red",
      detail: `${productsWithSales}/${totalProducts} productos con ventas registradas. Los productos sin ventas no se incluirán en la declaración SINADER.`,
    },
    {
      name: "Mapeo de Tarifas",
      status:
        skusWithoutCost === 0
          ? "Todos los SKUs tienen tarifa asignada"
          : `${skusWithoutCost} SKUs sin tarifa`,
      level:
        skusWithoutCost === 0
          ? "green"
          : skusWithoutCost <= 3
            ? "yellow"
            : "red",
      detail: `${skusWithCost}/${totalProducts} productos con mapeo de tarifas. Sin mapeo, no se puede calcular el costo REP.`,
    },
    {
      name: "Clasificación de Piezas",
      status:
        allPieces.length > 0
          ? `${allPieces.length} piezas clasificadas`
          : "Sin piezas registradas",
      level: allPieces.length > 0 ? "green" : "red",
      detail: `Cada pieza debe tener material, peso y tipo de residuo correctamente asignados.`,
    },
    {
      name: "Materiales No Reciclables",
      status:
        nonRecyclablePieces.length === 0
          ? "Todos los materiales son reciclables"
          : `${nonRecyclablePieces.length} piezas no reciclables`,
      level:
        nonRecyclablePieces.length === 0
          ? "green"
          : nonRecyclablePieces.length <= 5
            ? "yellow"
            : "red",
      detail: `Las piezas no reciclables tienen tarifas más altas. Considera ecodiseño para reducir costos.`,
    },
    {
      name: "Materiales Peligrosos",
      status:
        hazardousPieces.length === 0
          ? "Sin materiales peligrosos"
          : `${hazardousPieces.length} piezas peligrosas`,
      level: hazardousPieces.length === 0 ? "green" : "red",
      detail: `Los materiales peligrosos requieren gestión especial y tienen las tarifas más altas.`,
    },
    {
      name: "Contaminación con Grasa",
      status:
        greasePieces.length === 0
          ? "Sin piezas con grasa"
          : `${greasePieces.length} piezas con grasa`,
      level:
        greasePieces.length === 0
          ? "green"
          : greasePieces.length <= 3
            ? "yellow"
            : "red",
      detail: `Las piezas con grasa se clasifican en categorías de tarifa más costosas.`,
    },
  ];

  const criticalCount = risks.filter((r) => r.level === "red").length;
  const warningCount = risks.filter((r) => r.level === "yellow").length;
  const okCount = risks.filter((r) => r.level === "green").length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Riesgos</h1>
        <p className="text-muted-foreground mt-1">
          ¿Tengo mis datos completos para declarar? ¿Qué me falta?
        </p>
      </div>

      {/* Resumen semáforo */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card
          className={
            criticalCount > 0 ? "border-red-500/50 bg-red-500/5" : ""
          }
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Críticos</CardTitle>
            <XCircleIcon
              className={`h-4 w-4 ${criticalCount > 0 ? "text-red-500" : "text-muted-foreground"}`}
            />
          </CardHeader>
          <CardContent>
            <div
              className={`text-3xl font-bold ${criticalCount > 0 ? "text-red-500" : ""}`}
            >
              {criticalCount}
            </div>
            <p className="text-xs text-muted-foreground">
              Requieren acción inmediata
            </p>
          </CardContent>
        </Card>

        <Card
          className={
            warningCount > 0 ? "border-amber-500/50 bg-amber-500/5" : ""
          }
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Atención</CardTitle>
            <AlertTriangleIcon
              className={`h-4 w-4 ${warningCount > 0 ? "text-amber-500" : "text-muted-foreground"}`}
            />
          </CardHeader>
          <CardContent>
            <div
              className={`text-3xl font-bold ${warningCount > 0 ? "text-amber-500" : ""}`}
            >
              {warningCount}
            </div>
            <p className="text-xs text-muted-foreground">
              Riesgos menores, monitorear
            </p>
          </CardContent>
        </Card>

        <Card
          className={
            criticalCount === 0 && warningCount === 0
              ? "border-emerald-500/50 bg-emerald-500/5"
              : ""
          }
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">OK</CardTitle>
            <CheckCircle2Icon className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-500">{okCount}</div>
            <p className="text-xs text-muted-foreground">
              Sin riesgo detectado
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabla detallada de riesgos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlertIcon className="h-5 w-5 text-amber-500" />
            Semáforo de Cumplimiento
          </CardTitle>
          <CardDescription>
            Estado de cada aspecto requerido para la declaración REP
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Aspecto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Nivel</TableHead>
                <TableHead className="hidden lg:table-cell">Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {risks.map((risk) => (
                <TableRow key={risk.name}>
                  <TableCell className="font-medium">{risk.name}</TableCell>
                  <TableCell>{risk.status}</TableCell>
                  <TableCell>
                    <RiskBadge level={risk.level} />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                    {risk.detail}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* SKUs Sin Clasificar — tabla según prototipo P3 */}
      {nonRecyclablePieces.length > 0 && (
        <Card className="border-amber-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600">
              <PackageSearchIcon className="h-5 w-5" />
              SKUs Sin Clasificar ({nonRecyclablePieces.length} piezas)
            </CardTitle>
            <CardDescription>
              Piezas con clasificación de residuo &quot;no reciclable&quot; o datos
              incompletos. Revisa en Configuración → Productos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead>Material Declarado</TableHead>
                  <TableHead>Clasificación Faltante</TableHead>
                  <TableHead className="text-right">Impacto Est. (UF)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allProducts
                  .flatMap((p: any) =>
                    (p.pieces ?? [])
                      .filter((pc: any) => pc.wasteType === "non_recyclable")
                      .map((pc: any) => ({
                        sku: p.sku,
                        productName: p.name,
                        brand: p.brand ?? "—",
                        material: pc.materialDetail,
                        missing: pc.isDomiciliary ? "Domiciliario/No D." : "Tipo resina",
                        // Impacto estimado: peso × ventas / 1M × tarifa promedio (~3 UF/ton)
                        impact: (() => {
                          const sales = p.salesRecords?.[0]?.unitsSold ?? 0;
                          const tons = (pc.weightGrams * sales) / 1_000_000;
                          return Math.round(tons * 3 * 100) / 100; // ~3 UF/ton promedio
                        })(),
                      }))
                  )
                  .sort((a: any, b: any) => b.impact - a.impact)
                  .slice(0, 15)
                  .map((row: any, i: number) => (
                    <TableRow key={`${row.sku}-${i}`}>
                      <TableCell className="font-mono text-xs">
                        {row.sku}
                      </TableCell>
                      <TableCell>{row.productName}</TableCell>
                      <TableCell>{row.brand}</TableCell>
                      <TableCell>{row.material}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-amber-500 border-amber-500/30">
                          {row.missing}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {row.impact.toLocaleString("es-CL")}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
