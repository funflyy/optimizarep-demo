"use client";

import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { usePriorityProduct } from "@/components/priority-product-context";
import type { ReportContext } from "@/lib/report-stamp";

/**
 * Datos de procedencia comunes a todo export: quién lo generó, para qué
 * organización y sobre qué producto prioritario.
 *
 * Vive en un hook para que ninguna página tenga que acordarse de armarlo: si
 * cada export lo compone por su cuenta, terminan escribiendo el nombre de la
 * organización de tres maneras distintas.
 */
export function useReportContext(
  report: string,
  scope?: ReportContext["scope"]
): ReportContext {
  const { data: me } = trpc.auth.me.useQuery(undefined, { retry: false });
  const { data: orgs } = trpc.auth.writableOrgs.useQuery(undefined, {
    retry: false,
  });
  const { selected } = usePriorityProduct();

  return useMemo(() => {
    const org = orgs?.find((o) => o.id === me?.orgId);
    const nombre = [me?.firstName, me?.lastName].filter(Boolean).join(" ");
    return {
      report,
      organization: org?.name ?? null,
      user: nombre || me?.email || null,
      scope: {
        "Producto prioritario": selected?.name ?? null,
        ...scope,
      },
    };
  }, [report, scope, orgs, me, selected]);
}
