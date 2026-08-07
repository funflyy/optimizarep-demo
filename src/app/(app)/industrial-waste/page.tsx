"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ExcelExportButton } from "@/components/excel-export-button";
import { MONTH_NAMES } from "@/components/month-filter";
import { TrashIcon, RecycleIcon, WeightIcon, PackageIcon } from "lucide-react";
import { WasteFormDialog } from "./waste-form-dialog";

const ALL = "__all__";

const kg = (n: number) =>
  n.toLocaleString("es-CL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

/**
 * Gestión Industrial ("Patio Trasero").
 *
 * Los residuos que el productor entrega a gestores y declara al SINADER. Es un
 * registro independiente de la línea base de envases: acá no hay puesta en
 * mercado ni tarifas REP, sino retiros de residuo con su gestor y tratamiento.
 */
export default function IndustrialWastePage() {
  const [year, setYear] = useState<string>(ALL);
  const [month, setMonth] = useState<string>(ALL);
  const [lerFilter, setLerFilter] = useState<string>(ALL);

  const filters = useMemo(
    () => ({
      year: year !== ALL ? Number(year) : undefined,
      month: month !== ALL ? Number(month) : undefined,
      lerCode: lerFilter !== ALL ? lerFilter : undefined,
    }),
    [year, month, lerFilter]
  );

  const { data: records = [], isLoading } =
    trpc.industrialWaste.list.useQuery(filters);
  const { data: byLer = [] } = trpc.industrialWaste.summaryByLer.useQuery({
    year: year !== ALL ? Number(year) : undefined,
  });
  const { data: years = [] } = trpc.industrialWaste.availableYears.useQuery();
  const { data: ler = [] } = trpc.industrialWaste.lerCatalog.useQuery();

  const utils = trpc.useUtils();
  const remove = trpc.industrialWaste.delete.useMutation({
    onSuccess: () => {
      utils.industrialWaste.list.invalidate();
      utils.industrialWaste.summaryByLer.invalidate();
    },
  });

  const totalKg = records.reduce((a, r) => a + Number(r.totalKg), 0);

  /** Filas en el formato que pide el SINADER */
  const sinaderRows = records.map((r) => ({
    Fecha: new Date(r.wasteDate).toLocaleDateString("es-CL"),
    LER: r.lerCode,
    Residuo: r.wasteName,
    "RUT Gestor Receptor": r.handlerRut ?? "",
    "PLANTA DESTINO": r.destinationPlant ?? "",
    "ID VENTANILLA UNICA": r.singleWindowId ?? "",
    "Código Tratamiento": r.treatmentCode ?? "",
    "Descripción del Tratamiento": r.treatmentDescription ?? "",
    "Kilos Totales": Number(r.totalKg),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Gestión Industrial
          </h1>
          <p className="text-muted-foreground mt-1">
            Residuos entregados a gestores, para declarar al SINADER. Es
            independiente de la línea base de envases.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExcelExportButton
            data={sinaderRows}
            filename="Gestion_Industrial_SINADER"
            report="Gestión Industrial — formato SINADER"
            sheetName="SINADER"
            scope={{
              Año: year !== ALL ? year : "todos",
              Mes: month !== ALL ? MONTH_NAMES[Number(month)] : "todos",
              LER: lerFilter !== ALL ? lerFilter : "todos",
              Registros: records.length,
            }}
          />
          <WasteFormDialog lerCatalog={ler} />
        </div>
      </div>

      {/* Totales */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Kilos totales</CardTitle>
            <WeightIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kg(totalKg)} kg</div>
            <p className="text-xs text-muted-foreground">
              {kg(totalKg / 1000)} toneladas
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Registros</CardTitle>
            <PackageIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{records.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Códigos LER usados
            </CardTitle>
            <RecycleIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{byLer.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <span className="text-xs font-semibold text-muted-foreground px-1">
            Año
          </span>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <span className="text-xs font-semibold text-muted-foreground px-1">
            Mes
          </span>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {MONTH_NAMES.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)} className="capitalize">
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <span className="text-xs font-semibold text-muted-foreground px-1">
            Código LER
          </span>
          <Select value={lerFilter} onValueChange={setLerFilter}>
            <SelectTrigger className="w-[280px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {ler.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  <span className="font-mono text-xs mr-2">{l.code}</span>
                  {l.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Resumen por LER — es la agrupación con la que se declara */}
      {byLer.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Total por código LER</CardTitle>
            <CardDescription>
              Es la agrupación con la que se declara al SINADER: un registro por
              código de residuo y período.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>LER</TableHead>
                  <TableHead>Residuo</TableHead>
                  <TableHead className="text-right">Kilos</TableHead>
                  <TableHead className="text-right">Toneladas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byLer.map((r) => (
                  <TableRow key={`${r.lerCode}-${r.wasteName}`}>
                    <TableCell className="font-mono">{r.lerCode}</TableCell>
                    <TableCell>{r.wasteName}</TableCell>
                    <TableCell className="text-right font-mono">
                      {kg(r.totalKg)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {kg(r.totalTons)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Detalle */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Registros</CardTitle>
          <CardDescription>
            Cada retiro con su gestor, planta de destino y tratamiento
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <p className="py-4 text-sm text-muted-foreground">Cargando…</p>
          ) : records.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sin registros. Usa “Registrar retiro” para agregar el primero.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>LER</TableHead>
                  <TableHead>Residuo</TableHead>
                  <TableHead>Gestor</TableHead>
                  <TableHead>Planta destino</TableHead>
                  <TableHead>ID VU</TableHead>
                  <TableHead>Tratamiento</TableHead>
                  <TableHead className="text-right">Kilos</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(r.wasteDate).toLocaleDateString("es-CL")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {r.lerCode}
                      </Badge>
                    </TableCell>
                    <TableCell>{r.wasteName}</TableCell>
                    <TableCell className="text-sm">
                      {r.handlerName || r.handlerRut || "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.destinationPlant || "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.singleWindowId || "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.treatmentCode ? (
                        <>
                          <span className="font-mono text-xs">
                            {r.treatmentCode}
                          </span>
                          {r.treatmentDescription && (
                            <span className="text-muted-foreground">
                              {" "}
                              {r.treatmentDescription}
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {kg(Number(r.totalKg))}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (
                            confirm(
                              `¿Eliminar el retiro de ${r.wasteName} del ${new Date(r.wasteDate).toLocaleDateString("es-CL")}?`
                            )
                          ) {
                            remove.mutate({ id: r.id });
                          }
                        }}
                      >
                        <TrashIcon className="h-3 w-3" />
                      </Button>
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
