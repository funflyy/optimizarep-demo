import { db } from "@/server/db";
import {
  dashboardCharts,
  dashboardChartAssignments,
} from "@/server/db/schema";
import { eq, and, or, isNull } from "drizzle-orm";

/**
 * Charts visibles para un user:
 * - Charts de la enterprise del user
 * - Que NO estén asignados a ninguna org (visibles a todas las orgs de la enterprise)
 *   O que estén asignados a la org del user
 *
 * Si no hay enterpriseId (superadmin sin contexto), no devuelve nada.
 */
export async function getVisibleCharts(
  orgDbId: string | null,
  enterpriseId: string | null,
) {
  if (!enterpriseId) return [];

  const rows = await db
    .select({
      chart: dashboardCharts,
      assignedOrgId: dashboardChartAssignments.organizationId,
    })
    .from(dashboardCharts)
    .leftJoin(
      dashboardChartAssignments,
      eq(dashboardChartAssignments.chartId, dashboardCharts.id),
    )
    .where(
      and(
        eq(dashboardCharts.enterpriseId, enterpriseId),
        orgDbId
          ? or(
              isNull(dashboardChartAssignments.organizationId),
              eq(dashboardChartAssignments.organizationId, orgDbId),
            )
          : isNull(dashboardChartAssignments.organizationId),
      ),
    )
    .orderBy(dashboardCharts.position);

  const seen = new Map<string, (typeof rows)[number]["chart"]>();
  for (const r of rows) {
    if (!seen.has(r.chart.id)) seen.set(r.chart.id, r.chart);
  }
  return Array.from(seen.values());
}
