"use client";

import { useState, useMemo } from "react";
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
  DollarSignIcon,
  WeightIcon,
  FilterIcon,
  TrendingDownIcon,
  PackageIcon,
  BarChart3Icon,
  TagIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from "lucide-react";

export default function CostsPage() {
  const [year, setYear] = useState<string>("all");
  const [brand, setBrand] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [materialClass, setMaterialClass] = useState<string>("all");
  const [sig, setSig] = useState<string>("all");
  const productType = useProductType();

  const filters = useMemo(
    () => ({
      year: year !== "all" ? Number(year) : undefined,
      brand: brand !== "all" ? brand : undefined,
      category: category !== "all" ? category : undefined,
      materialClass: materialClass !== "all" ? materialClass : undefined,
      systemName: sig !== "all" ? sig : undefined,
      productType: productType ?? undefined,
    }),
    [year, brand, category, materialClass, sig, productType]
  );

  const { data: filterOptions } = trpc.costs.availableFilters.useQuery({
    productType: productType ?? undefined,
  });
  const { data: summary, isLoading: summaryLoading } =
    trpc.costs.summary.useQuery(filters);
  const { data: byMaterial, isLoading: materialLoading } =
    trpc.costs.byMaterial.useQuery(filters);
  const { data: byBrand, isLoading: brandLoading } =
    trpc.costs.byBrand.useQuery(filters);
  const { data: topSkus, isLoading: topLoading } =
    trpc.costs.topSkus.useQuery({ ...filters, limit: 10 });

  const isFiltered = year !== "all" || brand !== "all" || category !== "all" || materialClass !== "all" || sig !== "all";

  const clearFilters = () => {
    setYear("all");
    setBrand("all");
    setCategory("all");
    setMaterialClass("all");
    setSig("all");
  };

  return (
    <div className="space-y-8">
      {/* Header + Filtros */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Costos REP</h1>
          <p className="text-muted-foreground mt-1">
            ¿Qué SKU, marca o material me genera el mayor costo?
          </p>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex items-center gap-2 pb-2 text-muted-foreground">
            <FilterIcon className="h-4 w-4" />
            <span className="text-sm font-medium">Filtrar:</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground px-1">Año</span>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-[110px]">
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

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground px-1">Marca</span>
            <Select value={brand} onValueChange={setBrand}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Marca" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {filterOptions?.brands.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground px-1">Categoría</span>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {filterOptions?.categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground px-1">Material</span>
            <Select value={materialClass} onValueChange={setMaterialClass}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Material" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {filterOptions?.materials.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground px-1">SIG</span>
            <Select value={sig} onValueChange={setSig}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="SIG" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {filterOptions?.systems.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isFiltered && (
            <div className="pb-1.5">
              <Badge
                variant="secondary"
                className="cursor-pointer py-1 px-2.5 hover:bg-destructive hover:text-white transition-colors"
                onClick={clearFilters}
              >
                Limpiar ✕
              </Badge>
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Toneladas Mercado
            </CardTitle>
            <WeightIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryLoading
                ? "..."
                : `${(summary?.totalTons ?? 0).toLocaleString("es-CL")} ton`}
            </div>
            <p className="text-xs text-muted-foreground">
              Peso × ventas declaradas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Costo REP Total
            </CardTitle>
            <DollarSignIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryLoading
                ? "..."
                : `UF ${(summary?.totalCostUf ?? 0).toLocaleString("es-CL")}`}
            </div>
            <p className="text-xs text-muted-foreground">
              Según el SIG activo de cada productor
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Material Mayor Costo
            </CardTitle>
            <BarChart3Icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryLoading ? "..." : summary?.topMaterial ?? "—"}
            </div>
            <p className="text-xs text-muted-foreground">
              {summaryLoading
                ? "..."
                : `UF ${(summary?.topMaterialCost ?? 0).toLocaleString("es-CL")}`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              SKUs con Costo
            </CardTitle>
            <PackageIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryLoading ? "..." : summary?.skuCount ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Con mapeo de tarifas activo
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Costo por SIG */}
      {summary?.costBySig && summary.costBySig.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Distribución por Sistema de Gestión</CardTitle>
            <CardDescription>
              Toneladas y costo declarados en cada SIG (según el sistema activo
              de cada productor). Para comparar tarifas entre SIG usa el
              Comparador.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {summary.costBySig.map((sig) => {
                return (
                  <Card key={sig.systemName}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                          {sig.systemName}
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        UF {sig.costUf.toLocaleString("es-CL")}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {sig.tons.toLocaleString("es-CL")} toneladas
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabla: Costo por Material */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3Icon className="h-5 w-5 text-emerald-600" />
            Costo por Material
          </CardTitle>
          <CardDescription>
            Toneladas y costo por material, comparado entre SIGs
          </CardDescription>
        </CardHeader>
        <CardContent>
          {materialLoading ? (
            <p className="text-sm text-muted-foreground py-4">Cargando...</p>
          ) : byMaterial?.data.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Sin datos. Verifica que existan mapeos de tarifas configurados.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Toneladas</TableHead>
                  {byMaterial?.systems.map((s) => (
                    <TableHead key={s} className="text-right">
                      {s} (UF)
                    </TableHead>
                  ))}
                  <TableHead className="text-right">% del Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byMaterial?.data.map((row) => (
                  <TableRow key={row.material}>
                    <TableCell className="font-medium">
                      {row.material}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.tons.toLocaleString("es-CL")}
                    </TableCell>
                    {byMaterial.systems.map((s) => {
                      const cost = row.costsBySig[s] ?? 0;
                      const allCosts = byMaterial.systems.map(
                        (sys) => row.costsBySig[sys] ?? 0
                      );
                      const min = Math.min(...allCosts.filter((c) => c > 0));
                      const isMin = cost === min && cost > 0;
                      return (
                        <TableCell
                          key={s}
                          className={`text-right ${isMin ? "text-emerald-600 font-semibold" : ""}`}
                        >
                          {cost.toLocaleString("es-CL")}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right">
                      {row.pctTotal.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
                {/* Fila TOTAL */}
                {byMaterial && byMaterial.data.length > 0 && (
                  <TableRow className="border-t-2 font-bold bg-muted/30">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right">
                      {byMaterial.data
                        .reduce((s, r) => s + r.tons, 0)
                        .toLocaleString("es-CL")}
                    </TableCell>
                    {byMaterial.systems.map((sys) => (
                      <TableCell key={sys} className="text-right">
                        {byMaterial.data
                          .reduce((s, r) => s + (r.costsBySig[sys] ?? 0), 0)
                          .toLocaleString("es-CL")}
                      </TableCell>
                    ))}
                    <TableCell className="text-right">100,0%</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Tabla: Costo por Marca */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TagIcon className="h-5 w-5 text-blue-600" />
            Costo por Marca
          </CardTitle>
          <CardDescription>
            Costo total y diferencia entre SIGs por cada marca
          </CardDescription>
        </CardHeader>
        <CardContent>
          {brandLoading ? (
            <p className="text-sm text-muted-foreground py-4">Cargando...</p>
          ) : byBrand?.data.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Sin datos
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Marca</TableHead>
                  <TableHead className="text-right">N° SKUs</TableHead>
                  <TableHead className="text-right">Ton. Totales</TableHead>
                  {byBrand?.systems.map((s) => (
                    <TableHead key={s} className="text-right">
                      {s} (UF)
                    </TableHead>
                  ))}
                  {(byBrand?.systems.length ?? 0) >= 2 && (
                    <TableHead className="text-right">Diferencia</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {byBrand?.data.map((row) => {
                  const costs = byBrand!.systems.map(
                    (s) => row.costsBySig[s] ?? 0
                  );
                  const diff =
                    costs.length >= 2
                      ? costs[costs.length - 1] - costs[0]
                      : 0;
                  return (
                    <TableRow key={row.brand}>
                      <TableCell className="font-medium">
                        {row.brand}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.skuCount}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.tons.toLocaleString("es-CL")}
                      </TableCell>
                      {byBrand!.systems.map((s) => (
                        <TableCell key={s} className="text-right">
                          {(row.costsBySig[s] ?? 0).toLocaleString("es-CL")}
                        </TableCell>
                      ))}
                      {byBrand!.systems.length >= 2 && (
                        <TableCell
                          className={`text-right font-medium ${diff < 0 ? "text-emerald-600" : diff > 0 ? "text-red-500" : ""}`}
                        >
                          <span className="flex items-center justify-end gap-1">
                            {diff < 0 ? (
                              <ArrowDownIcon className="h-3 w-3" />
                            ) : diff > 0 ? (
                              <ArrowUpIcon className="h-3 w-3" />
                            ) : null}
                            {Math.abs(diff).toLocaleString("es-CL")} UF
                          </span>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Tabla: Top 10 SKUs más costosos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDownIcon className="h-5 w-5 text-amber-600" />
            Top 10 SKUs Más Costosos
          </CardTitle>
          <CardDescription>
            Los productos que más contribuyen al costo REP
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topLoading ? (
            <p className="text-sm text-muted-foreground py-4">Cargando...</p>
          ) : (topSkus?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Sin datos
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Ton.</TableHead>
                  <TableHead className="text-right">Costo (UF)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topSkus?.map((row, i) => (
                  <TableRow key={row.sku}>
                    <TableCell className="text-muted-foreground">
                      {i + 1}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.sku}
                    </TableCell>
                    <TableCell>{row.productName}</TableCell>
                    <TableCell>{row.brand ?? "—"}</TableCell>
                    <TableCell>{row.materialClass}</TableCell>
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
    </div>
  );
}
