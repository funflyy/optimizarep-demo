"use client";

import { trpc } from "@/lib/trpc";
import { formatCLP } from "@/lib/number";
import { CircleDollarSignIcon } from "lucide-react";

/**
 * Valor UF del día en el sidebar (fuente: Banco Central, cache diario).
 * Acuerdo 11-jul: el CLP es referencial y siempre debe verse con qué
 * UF y fecha se calculó.
 */
export function SidebarUf() {
  const { data, isLoading } = trpc.uf.current.useQuery(undefined, {
    staleTime: 1000 * 60 * 60, // 1 hora
    refetchOnWindowFocus: false,
  });

  return (
    <div className="mx-2 mb-1 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 group-data-[collapsible=icon]:hidden">
      <div className="flex items-center gap-2">
        <CircleDollarSignIcon className="size-4 shrink-0 text-sidebar-primary" />
        <div className="grid leading-tight">
          <span className="text-sm font-semibold text-sidebar-foreground">
            {isLoading
              ? "UF …"
              : data
                ? `UF = ${formatCLP(data.valueClp)}`
                : "UF no disponible"}
          </span>
          {data && (
            <span className="text-[10px] text-sidebar-foreground/60">
              {new Date(data.date + "T12:00:00").toLocaleDateString("es-CL")}
              {" · "}
              {data.source}
              {data.stale ? " (último disponible)" : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
