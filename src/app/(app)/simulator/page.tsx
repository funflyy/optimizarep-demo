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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  SlidersHorizontalIcon,
  ArrowRightIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  RefreshCwIcon,
  SearchIcon,
  WeightIcon,
  PackageIcon,
} from "lucide-react";

export default function SimulatorPage() {
  const [selectedSku, setSelectedSku] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [newWeight, setNewWeight] = useState<string>("");
  const [newUnits, setNewUnits] = useState<string>("");
  const [newMaterial, setNewMaterial] = useState<string>("");
  /** Pieza a simular, como "nombre|materialDetalle" */
  const [selectedPiece, setSelectedPiece] = useState<string>("");

  const formatChilean = (num: number, decimals: number = 2): string => {
    if (num === undefined || num === null || isNaN(num)) return "0";
    const fixed = Math.abs(num).toFixed(decimals);
    const [intPart, decPart] = fixed.split(".");
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (num < 0 ? "-" : "") + (decPart ? `${formattedInt},${decPart}` : formattedInt);
  };

  const productType = useProductType();
  const { data: filterOptions } = trpc.costs.availableFilters.useQuery({
    productType: productType ?? undefined,
  });
  const { data: productList } = trpc.product.list.useQuery({
    limit: 100,
    productType: productType ?? undefined,
  });

  const [pieceName, pieceMaterial] = selectedPiece
    ? selectedPiece.split("|")
    : [undefined, undefined];

  // Solo ejecutar cuando hay SKU y año
  const simulationInput = useMemo(() => {
    if (!selectedSku || !year) return null;
    return {
      sku: selectedSku,
      year: Number(year),
      newWeightGrams: newWeight ? Number(newWeight) : undefined,
      newUnitsSold: newUnits ? Number(newUnits) : undefined,
      newMaterialDetail: newMaterial || undefined,
      // El peso y la materialidad aplican solo a esta pieza
      pieceName,
      materialDetail: pieceMaterial,
    };
  }, [selectedSku, year, newWeight, newUnits, newMaterial, pieceName, pieceMaterial]);

  const {
    data: simulation,
    isLoading,
    isFetching,
  } = trpc.costs.simulate.useQuery(simulationInput!, {
    enabled: !!simulationInput,
  });

  const hasError = simulation && "error" in simulation;
  const hasResults = simulation && !hasError && simulation.results?.length > 0;

  const resetSimulation = () => {
    setNewWeight("");
    setNewUnits("");
    setNewMaterial("");
    setSelectedPiece("");
  };

  const pieces = hasResults ? simulation.pieces : [];
  const pieceKey = (p: { pieceName: string; materialDetail: string }) =>
    `${p.pieceName}|${p.materialDetail}`;
  /** El peso y la materialidad exigen elegir pieza: si no, se mezclan materiales */
  const needsPiece = pieces.length > 1 && !selectedPiece;

  // Cambio de materialidad: solo aplica a envases (ecodiseño)
  const isEnvases = productType === "envases_embalajes";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Simulador</h1>
        <p className="text-muted-foreground mt-1">
          ¿Qué pasa si cambio el peso, material o volumen de un SKU?
        </p>
      </div>

      {/* Panel de configuración */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SlidersHorizontalIcon className="h-5 w-5 text-emerald-600" />
            Configurar Simulación
          </CardTitle>
          <CardDescription>
            Selecciona un producto y modifica las variables para ver el impacto
            en el costo REP
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
            {/* SKU selector — min-w-0 + truncate: el nombre del producto se
                desbordaba sobre el campo Año */}
            <div className="space-y-2 min-w-0">
              <Label htmlFor="sku">Producto (SKU)</Label>
              <Select value={selectedSku} onValueChange={setSelectedSku}>
                <SelectTrigger id="sku" className="w-full min-w-0">
                  <SelectValue
                    placeholder="Seleccionar SKU..."
                    className="truncate"
                  />
                </SelectTrigger>
                <SelectContent className="max-w-[min(90vw,28rem)]">
                  {productList?.products.map((p) => (
                    <SelectItem key={p.id} value={p.sku}>
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="font-mono text-xs shrink-0">
                          {p.sku}
                        </span>
                        <span className="truncate text-muted-foreground">
                          {p.name}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Año */}
            <div className="space-y-2">
              <Label htmlFor="year">Año</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger id="year">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {filterOptions?.years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Pieza a simular — sin esto el peso se aplicaba a todas las
                piezas y se mezclaban materiales de precio muy distinto */}
            {pieces.length > 1 && (
              <div className="space-y-2 min-w-0">
                <Label htmlFor="piece">Pieza a modificar</Label>
                <Select value={selectedPiece} onValueChange={setSelectedPiece}>
                  <SelectTrigger id="piece" className="w-full min-w-0">
                    <SelectValue placeholder="Elegir pieza..." className="truncate" />
                  </SelectTrigger>
                  <SelectContent className="max-w-[min(90vw,28rem)]">
                    {pieces.map((p) => (
                      <SelectItem key={pieceKey(p)} value={pieceKey(p)}>
                        <span className="flex min-w-0 items-baseline gap-2">
                          <span className="truncate">{p.pieceName}</span>
                          <span className="text-muted-foreground text-xs shrink-0">
                            {p.materialDetail} ·{" "}
                            {formatChilean(p.weightGrams, 2)} g ·{" "}
                            {p.isDomiciliary ? "DOM" : "NO DOM"}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Nuevo peso */}
            <div className="space-y-2">
              <Label htmlFor="weight">
                Nuevo Peso (g)
                {hasResults && !needsPiece && (
                  <span className="text-muted-foreground ml-1">
                    actual: {formatChilean(simulation.inputs.currentWeight, 2)}g
                  </span>
                )}
              </Label>
              <Input
                id="weight"
                type="number"
                min="0.1"
                step="0.1"
                disabled={needsPiece}
                placeholder={
                  needsPiece
                    ? "Elige una pieza"
                    : hasResults
                      ? String(simulation.inputs.currentWeight)
                      : "Peso en gramos"
                }
                value={newWeight}
                onChange={(e) => setNewWeight(e.target.value)}
              />
            </div>

            {/* Nuevo volumen */}
            <div className="space-y-2">
              <Label htmlFor="units">
                Nuevo Volumen (unidades)
                {hasResults && (
                  <span className="text-muted-foreground ml-1">
                    actual: {formatChilean(simulation.inputs.currentUnits, 0)}
                  </span>
                )}
              </Label>
              <Input
                id="units"
                type="number"
                min="1"
                step="1"
                placeholder={
                  hasResults
                    ? String(simulation.inputs.currentUnits)
                    : "Unidades vendidas"
                }
                value={newUnits}
                onChange={(e) => setNewUnits(e.target.value)}
              />
            </div>

            {/* Nueva materialidad (ecodiseño — solo envases) */}
            {isEnvases && (
              <div className="space-y-2">
                <Label htmlFor="material">
                  Nueva Materialidad
                  {hasResults && !needsPiece && (
                    <span className="text-muted-foreground ml-1">
                      actual: {simulation.inputs.currentMaterial}
                    </span>
                  )}
                </Label>
                <Select
                  value={newMaterial}
                  onValueChange={setNewMaterial}
                  disabled={needsPiece}
                >
                  <SelectTrigger id="material" className="w-full min-w-0">
                    <SelectValue
                      placeholder={
                        needsPiece ? "Elige una pieza" : "Mantener material..."
                      }
                      className="truncate"
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {filterOptions?.materials.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {hasResults && (newWeight || newUnits || newMaterial) && (
            <div className="mt-4 flex justify-end">
              <Button variant="outline" size="sm" onClick={resetSimulation}>
                <RefreshCwIcon className="h-3 w-3 mr-1" />
                Restaurar valores originales
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Estado vacío */}
      {!selectedSku && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <SearchIcon className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold">Selecciona un SKU</h3>
            <p className="text-muted-foreground max-w-md mt-1">
              Elige un producto y un año para ver el escenario actual. Luego
              modifica peso o volumen para simular el impacto en el costo REP.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {hasError && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="py-8 text-center">
            <p className="text-amber-600 font-medium">
              {(simulation as any).error}
            </p>
            <p className="text-muted-foreground text-sm mt-1">
              Verifica que el producto tenga ventas y mapeo de tarifas para ese
              año.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {isLoading && selectedSku && year && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground animate-pulse">
              Calculando simulación...
            </p>
          </CardContent>
        </Card>
      )}

      {/* Desglose de piezas: deja ver que un envase mezcla materiales con
          tarifas muy distintas, y cuál se está simulando */}
      {hasResults && simulation.pieces.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <PackageIcon className="h-4 w-4 text-muted-foreground" />
              Piezas del envase
            </CardTitle>
            <CardDescription>
              El peso y la materialidad se simulan por pieza. Cada material tiene
              su propia tarifa, así que cambiarlas todas juntas distorsiona el
              resultado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pieza</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Segmento</TableHead>
                  <TableHead className="text-right">Peso (g)</TableHead>
                  <TableHead className="text-right">% del peso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {simulation.pieces.map((p) => {
                  const isTarget = pieceKey(p) === selectedPiece;
                  return (
                    <TableRow
                      key={pieceKey(p)}
                      className={isTarget ? "bg-primary/5" : undefined}
                    >
                      <TableCell className="font-medium">
                        {p.pieceName}
                        {isTarget && (
                          <Badge className="ml-2 text-xs">simulando</Badge>
                        )}
                      </TableCell>
                      <TableCell>{p.materialDetail}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal text-xs">
                          {p.isDomiciliary ? "DOM" : "NO DOM"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatChilean(p.weightGrams, 2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {simulation.totalWeightGrams > 0
                          ? formatChilean(
                              (p.weightGrams / simulation.totalWeightGrams) * 100,
                              1
                            )
                          : "0"}
                        %
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Resultados de simulación */}
      {hasResults && (
        <>
          {/* Inputs comparados */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Producto
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-bold">{simulation.productName}</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {simulation.sku}
                </p>
                <p className="text-xs mt-1">
                  <span className="text-muted-foreground">
                    {simulation.inputs.pieceName
                      ? `${simulation.inputs.pieceName}: `
                      : "Material: "}
                  </span>
                  {simulation.inputs.currentMaterial}
                  {simulation.inputs.newMaterial !==
                    simulation.inputs.currentMaterial && (
                    <span className="font-semibold text-emerald-500">
                      {" → "}
                      {simulation.inputs.newMaterial}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {simulation.pieces.length} pieza
                  {simulation.pieces.length === 1 ? "" : "s"} ·{" "}
                  {formatChilean(simulation.totalWeightGrams, 2)} g por unidad
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <WeightIcon className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Peso
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {simulation.inputs.currentWeight}g
                  </span>
                  <ArrowRightIcon className="h-4 w-4 text-muted-foreground" />
                  <span
                    className={`text-lg font-bold ${
                      simulation.inputs.newWeight !==
                      simulation.inputs.currentWeight
                        ? "text-emerald-500"
                        : ""
                    }`}
                  >
                    {simulation.inputs.newWeight}g
                  </span>
                  {simulation.inputs.newWeight !==
                    simulation.inputs.currentWeight && (
                    <Badge variant="secondary" className="text-xs">
                      {(
                        ((simulation.inputs.newWeight -
                          simulation.inputs.currentWeight) /
                          simulation.inputs.currentWeight) *
                        100
                      ).toFixed(1)}
                      %
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <PackageIcon className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Volumen Ventas
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {formatChilean(simulation.inputs.currentUnits, 0)}
                  </span>
                  <ArrowRightIcon className="h-4 w-4 text-muted-foreground" />
                  <span
                    className={`text-lg font-bold ${
                      simulation.inputs.newUnits !==
                      simulation.inputs.currentUnits
                        ? "text-emerald-500"
                        : ""
                    }`}
                  >
                    {formatChilean(simulation.inputs.newUnits, 0)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabla comparativa por SIG */}
          <Card>
            <CardHeader>
              <CardTitle>Resultado por Sistema de Gestión</CardTitle>
              <CardDescription>
                Comparación del escenario actual vs. simulado
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SIG</TableHead>
                    <TableHead className="text-right">
                      Ton. Actual
                    </TableHead>
                    <TableHead className="text-right">
                      Ton. Simulado
                    </TableHead>
                    <TableHead className="text-right">
                      Costo Actual (UF)
                    </TableHead>
                    <TableHead className="text-right">
                      Costo Simulado (UF)
                    </TableHead>
                    <TableHead className="text-right">Δ Costo (UF)</TableHead>
                    <TableHead className="text-right">Δ %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {simulation.results.map((row) => (
                    <TableRow key={row.systemName}>
                      <TableCell className="font-medium">
                        {row.systemName}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatChilean(row.current.tons, 3)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatChilean(row.simulated.tons, 3)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatChilean(row.current.costUf, 3)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatChilean(row.simulated.costUf, 3)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-semibold ${
                          row.diff.costUf < 0
                            ? "text-emerald-500"
                            : row.diff.costUf > 0
                              ? "text-red-500"
                              : ""
                        }`}
                      >
                        <span className="flex items-center justify-end gap-1">
                          {row.diff.costUf < 0 ? (
                            <TrendingDownIcon className="h-3 w-3" />
                          ) : row.diff.costUf > 0 ? (
                            <TrendingUpIcon className="h-3 w-3" />
                          ) : null}
                          {row.diff.costUf > 0 ? "+" : ""}
                          {formatChilean(row.diff.costUf, 3)}
                        </span>
                      </TableCell>
                      <TableCell
                        className={`text-right ${
                          row.diff.pctChange < 0
                            ? "text-emerald-500"
                            : row.diff.pctChange > 0
                              ? "text-red-500"
                              : ""
                        }`}
                      >
                        {row.diff.pctChange > 0 ? "+" : ""}
                        {formatChilean(row.diff.pctChange, 1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Insight box */}
          {(() => {
            const results = simulation.results;
            if (results.length === 0) return null;

            const diffs = results.map(r => r.diff.costUf);
            const allSaving = diffs.every(d => d <= 0);
            const allCost = diffs.every(d => d >= 0);

            // Formateador chileno explícito usando formatChilean
            const formatUF = (val: number) => {
              return formatChilean(val, 3);
            };

            return (
              <Card
                className={
                  allSaving
                    ? "border-emerald-500/50 bg-emerald-500/5"
                    : allCost
                      ? "border-red-500/50 bg-red-500/5"
                      : "border-amber-500/50 bg-amber-500/5"
                }
              >
                <CardContent className="py-6">
                  <div className="flex items-start gap-3">
                    {allSaving ? (
                      <TrendingDownIcon className="h-6 w-6 text-emerald-500 mt-0.5" />
                    ) : (
                      <TrendingUpIcon className="h-6 w-6 text-red-500 mt-0.5" />
                    )}
                    <div className="space-y-1.5 w-full">
                      <p className="font-semibold text-lg">
                        {allSaving ? "Ahorro estimado:" : "Costo adicional estimado:"}
                      </p>
                      
                      <div className="grid gap-2 sm:grid-cols-2 mt-3 max-w-md">
                        {results.map((r) => {
                          const isSavingRow = r.diff.costUf < 0;
                          return (
                            <div key={r.systemName} className="flex items-center justify-between border-b pb-1">
                              <span className="font-medium text-muted-foreground">{r.systemName}:</span>
                              <span
                                className={`font-bold ${
                                  isSavingRow ? "text-emerald-600" : r.diff.costUf > 0 ? "text-red-600" : ""
                                }`}
                              >
                                {isSavingRow ? "-" : r.diff.costUf > 0 ? "+" : ""}
                                UF {formatUF(r.diff.costUf)}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      <p className="text-xs text-muted-foreground mt-4 pt-2 border-t">
                        {allSaving
                          ? "Reducir el gramaje o volumen genera un ahorro directo en la obligación REP."
                          : "El cambio simulado incrementa el costo de la obligación REP."}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </>
      )}
    </div>
  );
}
