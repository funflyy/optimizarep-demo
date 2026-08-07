"use client";

import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SaveIcon,
  TrashIcon,
  Loader2Icon,
  LayersIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react";

export interface ScenarioChanges {
  pieceName?: string;
  materialDetail?: string;
  newWeightGrams?: number;
  newMaterialDetail?: string;
  newUnitsSold?: number;
}

const num = (n: number, d = 2) =>
  n.toLocaleString("es-CL", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Descripción legible del cambio que define el escenario */
function describeChanges(c: ScenarioChanges): string {
  const partes: string[] = [];
  if (c.newWeightGrams !== undefined)
    partes.push(`peso → ${num(c.newWeightGrams)} g`);
  if (c.newMaterialDetail) partes.push(`material → ${c.newMaterialDetail}`);
  if (c.newUnitsSold !== undefined)
    partes.push(`volumen → ${c.newUnitsSold.toLocaleString("es-CL")}`);
  const donde = c.pieceName ? `${c.pieceName}: ` : "";
  return donde + (partes.join(" · ") || "sin cambios");
}

/**
 * Una fila del comparador.
 *
 * Cada escenario recalcula con `simulate` en vez de mostrar el resultado
 * guardado: así los números siguen siendo válidos si cambian las tarifas o el
 * mapeo desde que se guardó.
 */
function ScenarioRow({
  scenario,
  onDelete,
  deleting,
}: {
  scenario: {
    id: string;
    name: string;
    notes: string | null;
    sku: string;
    year: number;
    changes: ScenarioChanges | null;
    createdAt: Date;
  };
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const c = scenario.changes ?? {};
  const { data, isLoading } = trpc.costs.simulate.useQuery({
    sku: scenario.sku,
    year: scenario.year,
    pieceName: c.pieceName,
    materialDetail: c.materialDetail,
    newWeightGrams: c.newWeightGrams,
    newMaterialDetail: c.newMaterialDetail,
    newUnitsSold: c.newUnitsSold,
  });

  const results = data && !("error" in data) ? data.results : [];
  // Se compara sobre el SIG de mayor costo actual, que es el que se declara
  const principal = [...results].sort(
    (a, b) => b.current.costUf - a.current.costUf
  )[0];

  return (
    <TableRow>
      <TableCell>
        <p className="font-medium">{scenario.name}</p>
        {scenario.notes && (
          <p className="text-xs text-muted-foreground">{scenario.notes}</p>
        )}
        <p className="text-xs text-muted-foreground mt-0.5">
          {new Date(scenario.createdAt).toLocaleDateString("es-CL")}
        </p>
      </TableCell>
      <TableCell className="text-sm">{describeChanges(c)}</TableCell>
      {isLoading ? (
        <TableCell colSpan={4} className="text-center">
          <Loader2Icon className="inline h-3 w-3 animate-spin text-muted-foreground" />
        </TableCell>
      ) : !principal ? (
        <TableCell colSpan={4} className="text-sm text-muted-foreground">
          Sin datos para ese año
        </TableCell>
      ) : (
        <>
          <TableCell className="text-right font-mono text-muted-foreground">
            {num(principal.current.costUf)}
          </TableCell>
          <TableCell className="text-right font-mono font-semibold">
            {num(principal.simulated.costUf)}
          </TableCell>
          <TableCell className="text-right">
            <span
              className={`inline-flex items-center gap-1 font-mono font-semibold ${
                principal.diff.costUf < 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : principal.diff.costUf > 0
                    ? "text-destructive"
                    : "text-muted-foreground"
              }`}
            >
              {principal.diff.costUf < 0 ? (
                <TrendingDownIcon className="h-3 w-3" />
              ) : principal.diff.costUf > 0 ? (
                <TrendingUpIcon className="h-3 w-3" />
              ) : null}
              {principal.diff.costUf > 0 ? "+" : ""}
              {num(principal.diff.costUf)}
            </span>
          </TableCell>
          <TableCell className="text-right text-xs text-muted-foreground">
            {principal.systemName}
          </TableCell>
        </>
      )}
      <TableCell>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-destructive hover:text-destructive"
          disabled={deleting}
          onClick={() => onDelete(scenario.id)}
        >
          <TrashIcon className="h-3 w-3" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

/**
 * Guardar y comparar varias alternativas de ecodiseño.
 *
 * MB pidió no tener que ir de una en una: el valor está en ver los escenarios
 * uno al lado del otro y elegir.
 */
export function ScenarioPanel({
  sku,
  year,
  changes,
  canSave,
}: {
  sku: string;
  year: number;
  /** Cambios actualmente cargados en el simulador */
  changes: ScenarioChanges;
  canSave: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  const utils = trpc.useUtils();
  const { data: scenarios = [] } = trpc.costs.listScenarios.useQuery(
    { sku },
    { enabled: !!sku }
  );

  const save = trpc.costs.saveScenario.useMutation({
    onSuccess: () => {
      utils.costs.listScenarios.invalidate();
      setName("");
      setNotes("");
      setOpen(false);
    },
  });
  const remove = trpc.costs.deleteScenario.useMutation({
    onSuccess: () => utils.costs.listScenarios.invalidate(),
  });

  if (!sku) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <LayersIcon className="h-5 w-5 text-muted-foreground" />
              Escenarios guardados
            </CardTitle>
            <CardDescription>
              Se recalculan cada vez, así que los números siguen vigentes aunque
              cambien las tarifas o el mapeo.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            disabled={!canSave}
            onClick={() => setOpen(true)}
            title={
              canSave
                ? undefined
                : "Modifica peso, material o volumen para guardar un escenario"
            }
          >
            <SaveIcon className="mr-2 h-4 w-4" />
            Guardar este escenario
          </Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {scenarios.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Sin escenarios para este SKU. Modifica algo y guárdalo para poder
            comparar alternativas.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Escenario</TableHead>
                <TableHead>Cambio</TableHead>
                <TableHead className="text-right">Actual (UF)</TableHead>
                <TableHead className="text-right">Simulado (UF)</TableHead>
                <TableHead className="text-right">Δ</TableHead>
                <TableHead className="text-right">SIG</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {scenarios.map((s) => (
                <ScenarioRow
                  key={s.id}
                  scenario={s}
                  onDelete={(id) => remove.mutate({ id })}
                  deleting={remove.isPending}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Guardar escenario</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-mono text-xs text-muted-foreground">{sku}</p>
              <p className="mt-1">{describeChanges(changes)}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="scenarioName">Nombre</Label>
              <Input
                id="scenarioName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Botella 10% más liviana"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scenarioNotes">Nota (opcional)</Label>
              <Input
                id="scenarioNotes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Validar con proveedor antes de comprometer"
              />
            </div>
            {save.error && (
              <p className="text-sm text-destructive">{save.error.message}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                disabled={!name.trim() || save.isPending}
                onClick={() =>
                  save.mutate({
                    name: name.trim(),
                    notes: notes.trim() || undefined,
                    sku,
                    year,
                    changes,
                  })
                }
              >
                {save.isPending && (
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                )}
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
