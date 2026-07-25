import { db } from "@/server/db";
import {
  dashboardCharts,
  dashboardChartAssignments,
} from "@/server/db/schema";
import { eq, or, isNull } from "drizzle-orm";

export async function getVisibleCharts(orgDbId: string | null) {
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
      orgDbId
        ? or(
            isNull(dashboardChartAssignments.organizationId),
            eq(dashboardChartAssignments.organizationId, orgDbId),
          )
        : isNull(dashboardChartAssignments.organizationId),
    )
    .orderBy(dashboardCharts.position);

  const seen = new Map<string, (typeof rows)[number]["chart"]>();
  for (const r of rows) {
    if (!seen.has(r.chart.id)) seen.set(r.chart.id, r.chart);
  }
  return Array.from(seen.values());
}
