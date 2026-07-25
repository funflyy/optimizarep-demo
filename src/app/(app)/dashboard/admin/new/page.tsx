"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import {
  CHART_TYPES,
  DIMENSION_FIELDS,
  WIZARD_METRICS,
  AGGREGATIONS,
} from "@/lib/chart-types";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";

export default function NewChartPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const orgs = trpc.dashboardCharts.listOrganizations.useQuery();
  const create = trpc.dashboardCharts.create.useMutation({
    onSuccess: () => {
      utils.dashboardCharts.list.invalidate();
      router.push("/dashboard/admin");
    },
  });

  const [name, setName] = useState("");
  const [chartType, setChartType] =
    useState<(typeof CHART_TYPES)[number]>("bar");
  const [dimension, setDimension] = useState<string>("materialClass");
  const [metric, setMetric] = useState<string>("weightGrams");
  const [aggregation, setAggregation] =
    useState<(typeof AGGREGATIONS)[number]>("sum");
  const [visibleToAll, setVisibleToAll] = useState(true);
  const [selectedOrgs, setSelectedOrgs] = useState<Set<string>>(new Set());

  const allowedDimensions =
    chartType === "kpi"
      ? []
      : chartType === "line"
        ? ["salesYear"]
        : [...DIMENSION_FIELDS];
  const aggregationOptions =
    metric === "pieces"
      ? (["count"] as const)
      : AGGREGATIONS.filter((a) => a !== "count");

  function submit() {
    create.mutate({
      name,
      chartType,
      dimension: chartType === "kpi" ? undefined : (dimension as any),
      metric: metric as any,
      aggregation,
      organizationIds: visibleToAll ? undefined : Array.from(selectedOrgs),
    });
  }

  return (
    <div className="space-y-6 p-8 max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight">Nuevo widget</h1>

      <Card>
        <CardHeader>
          <CardTitle>Configuración</CardTitle>
          <CardDescription>
            Define cómo se agrupan y agregan los datos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Nombre</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Peso por material"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select
                value={chartType}
                onValueChange={(v) =>
                  setChartType(v as (typeof CHART_TYPES)[number])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHART_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {allowedDimensions.length > 0 && (
              <div className="space-y-1">
                <Label>Dimensión</Label>
                <Select value={dimension} onValueChange={setDimension}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedDimensions.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label>Métrica</Label>
              <Select value={metric} onValueChange={setMetric}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WIZARD_METRICS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Agregación</Label>
              <Select
                value={aggregation}
                onValueChange={(v) =>
                  setAggregation(v as (typeof AGGREGATIONS)[number])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {aggregationOptions.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Asignación</CardTitle>
          <CardDescription>
            Si está apagado, debes elegir al menos una empresa (si no, nadie lo
            verá).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Visible para todas las empresas</Label>
            <Switch checked={visibleToAll} onCheckedChange={setVisibleToAll} />
          </div>
          {!visibleToAll && (
            <div className="space-y-2 max-h-64 overflow-y-auto border rounded p-3">
              {orgs.data?.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedOrgs.has(o.id)}
                    onCheckedChange={(checked) => {
                      const next = new Set(selectedOrgs);
                      if (checked) next.add(o.id);
                      else next.delete(o.id);
                      setSelectedOrgs(next);
                    }}
                  />
                  {o.name}{" "}
                  {o.rut && (
                    <span className="text-muted-foreground">· {o.rut}</span>
                  )}
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button onClick={submit} disabled={!name || create.isPending}>
          {create.isPending ? "Guardando..." : "Guardar"}
        </Button>
      </div>
    </div>
  );
}
