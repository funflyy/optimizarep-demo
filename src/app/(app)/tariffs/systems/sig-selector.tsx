"use client";

import { trpc } from "@/lib/trpc";
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
import { Badge } from "@/components/ui/badge";
import { Loader2Icon, CheckCircle2Icon, ScaleIcon } from "lucide-react";

/** Valor del Select que representa "sin SIG fijo" */
const LIBRE = "__libre__";

export function SigSelector({
  priorityProductId,
  priorityProductName,
}: {
  priorityProductId: string;
  priorityProductName: string;
}) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.tariff.sigConfig.useQuery({
    priorityProductId,
  });

  const setSig = trpc.tariff.setSig.useMutation({
    onSuccess: () => {
      utils.tariff.sigConfig.invalidate();
      // Los costos dependen del SIG: hay que recalcular
      utils.costs.invalidate();
    },
  });

  const activeSystemId = data?.activeSystemId ?? null;
  const isLibre = activeSystemId === null;
  const activeName = data?.systems.find((s) => s.id === activeSystemId)?.name;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ScaleIcon className="h-5 w-5 text-primary" />
              SIG de la organización
            </CardTitle>
            <CardDescription>
              Para {priorityProductName}. Elige un SIG fijo, o déjalo libre para
              comparar el costo en todos.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            {setSig.isPending && (
              <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {setSig.isSuccess && !setSig.isPending && (
              <CheckCircle2Icon className="h-4 w-4 text-emerald-500" />
            )}
            <Select
              disabled={isLoading || setSig.isPending}
              value={activeSystemId ?? LIBRE}
              onValueChange={(v) =>
                setSig.mutate({
                  priorityProductId,
                  systemId: v === LIBRE ? null : v,
                })
              }
            >
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue placeholder="Cargando…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={LIBRE}>
                  Libre — comparar todos los SIG
                </SelectItem>
                {data?.systems.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLibre ? (
          <p className="text-sm text-muted-foreground">
            <Badge variant="secondary" className="mr-2">
              Libre
            </Badge>
            Los costos se calculan contra los {data?.systems.length ?? 0} SIG
            disponibles. En cada pantalla puedes elegir cuál mirar y comparar.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            <Badge className="mr-2">{activeName ?? "—"}</Badge>
            Toda la plataforma calcula con este SIG. Cámbialo a{" "}
            <span className="font-medium">Libre</span> si quieres comparar.
          </p>
        )}

        {setSig.error && (
          <p className="mt-2 text-sm text-destructive">
            {setSig.error.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
