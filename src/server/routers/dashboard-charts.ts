import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, inArray } from "drizzle-orm";
import {
  createTRPCRouter,
  orgProcedure,
  enterpriseAdminProcedure,
  superAdminProcedure,
} from "@/server/trpc";
import {
  dashboardCharts,
  dashboardChartAssignments,
  organizations,
} from "@/server/db/schema";
import { getVisibleCharts } from "@/lib/dashboard-charts";
import { ChartConfigInputSchema } from "@/lib/chart-types";

/** Helper: valida que el chart pertenece a la enterprise del user (o superadmin). */
async function assertChartOwnership(
  ctx: { isSuperAdmin: boolean; enterpriseId: string | null },
  db: typeof import("@/server/db").db,
  chartId: string,
) {
  const chart = await db.query.dashboardCharts.findFirst({
    where: eq(dashboardCharts.id, chartId),
  });
  if (!chart) throw new TRPCError({ code: "NOT_FOUND" });
  if (ctx.isSuperAdmin) return chart;
  if (chart.enterpriseId !== ctx.enterpriseId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Chart no pertenece a tu enterprise",
    });
  }
  return chart;
}

/** Helper: valida que las orgs son de la enterprise del user (o superadmin). */
async function assertOrgsInEnterprise(
  ctx: { isSuperAdmin: boolean; enterpriseId: string | null },
  db: typeof import("@/server/db").db,
  orgIds: string[],
) {
  if (ctx.isSuperAdmin || orgIds.length === 0) return;
  const orgs = await db
    .select({ id: organizations.id, enterpriseId: organizations.enterpriseId })
    .from(organizations)
    .where(inArray(organizations.id, orgIds));
  for (const o of orgs) {
    if (o.enterpriseId !== ctx.enterpriseId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Org ${o.id} no pertenece a tu enterprise`,
      });
    }
  }
}

export const dashboardChartsRouter = createTRPCRouter({
  /** Charts visibles para el org del user (orgProcedure: filtra por enterprise + orgId) */
  list: orgProcedure.query(async ({ ctx }) => {
    return getVisibleCharts(ctx.orgDbId, ctx.enterpriseId);
  }),

  get: orgProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const visible = await getVisibleCharts(ctx.orgDbId, ctx.enterpriseId);
      const chart = visible.find((c) => c.id === input.id);
      if (!chart) throw new TRPCError({ code: "NOT_FOUND" });
      return chart;
    }),

  /** Lista las orgs de mi enterprise (para los formularios de assign) */
  listOrganizations: enterpriseAdminProcedure.query(async ({ ctx }) => {
    if (!ctx.enterpriseId) return [];
    return ctx.db
      .select({ id: organizations.id, name: organizations.name, rut: organizations.rut })
      .from(organizations)
      .where(eq(organizations.enterpriseId, ctx.enterpriseId))
      .orderBy(organizations.name);
  }),

  /** Management: enterprise_admin crea chart en su enterprise */
  create: enterpriseAdminProcedure
    .input(ChartConfigInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.enterpriseId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Sin enterprise activa",
        });
      }

      const [row] = await ctx.db
        .insert(dashboardCharts)
        .values({
          enterpriseId: ctx.enterpriseId,
          name: input.name,
          chartType: input.chartType,
          dimension:
            input.chartType === "kpi" ? null : (input.dimension ?? null),
          metric: input.metric === "pieces" ? "unitsSold" : input.metric,
          aggregation: input.aggregation,
          filters: input.filters ?? null,
        })
        .returning();

      if (input.organizationIds?.length) {
        await assertOrgsInEnterprise(ctx, ctx.db, input.organizationIds);
        await ctx.db.insert(dashboardChartAssignments).values(
          input.organizationIds.map((organizationId) => ({
            chartId: row.id,
            organizationId,
          })),
        );
      }
      return row;
    }),

  update: enterpriseAdminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(200).optional(),
        chartType: z.enum(["bar", "pie", "line", "kpi"]).optional(),
        dimension: z
          .enum([
            "materialClass",
            "materialDetail",
            "wasteType",
            "isDomiciliary",
            "salesYear",
          ])
          .optional(),
        metric: z.enum(["weightGrams", "unitsSold", "pieces"]).optional(),
        aggregation: z.enum(["sum", "avg", "count"]).optional(),
        filters: z.any().optional(),
        organizationIds: z.array(z.string().uuid()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, organizationIds, ...rest } = input;

      await assertChartOwnership(ctx, ctx.db, id);

      const setValues: Record<string, unknown> = {};
      if (rest.name !== undefined) setValues.name = rest.name;
      if (rest.chartType !== undefined) setValues.chartType = rest.chartType;
      if (rest.dimension !== undefined) setValues.dimension = rest.dimension;
      if (rest.metric !== undefined)
        setValues.metric =
          rest.metric === "pieces" ? "unitsSold" : rest.metric;
      if (rest.aggregation !== undefined)
        setValues.aggregation = rest.aggregation;
      if (rest.filters !== undefined) setValues.filters = rest.filters ?? null;

      const [row] = await ctx.db
        .update(dashboardCharts)
        .set(setValues)
        .where(eq(dashboardCharts.id, id))
        .returning();

      if (organizationIds !== undefined) {
        await assertOrgsInEnterprise(ctx, ctx.db, organizationIds);
        await ctx.db
          .delete(dashboardChartAssignments)
          .where(eq(dashboardChartAssignments.chartId, id));
        if (organizationIds.length) {
          await ctx.db.insert(dashboardChartAssignments).values(
            organizationIds.map((organizationId) => ({
              chartId: id,
              organizationId,
            })),
          );
        }
      }
      return row;
    }),

  delete: enterpriseAdminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertChartOwnership(ctx, ctx.db, input.id);
      await ctx.db
        .delete(dashboardCharts)
        .where(eq(dashboardCharts.id, input.id));
      return { id: input.id };
    }),

  reorder: enterpriseAdminProcedure
    .input(
      z.array(z.object({ id: z.string().uuid(), position: z.number().int() })),
    )
    .mutation(async ({ ctx, input }) => {
      // Validar todos los charts antes de aplicar
      for (const item of input) {
        await assertChartOwnership(ctx, ctx.db, item.id);
      }
      await Promise.all(
        input.map((item) =>
          ctx.db
            .update(dashboardCharts)
            .set({ position: item.position })
            .where(eq(dashboardCharts.id, item.id)),
        ),
      );
      return { ok: true };
    }),

  assign: enterpriseAdminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        organizationIds: z.array(z.string().uuid()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertChartOwnership(ctx, ctx.db, input.id);
      await assertOrgsInEnterprise(ctx, ctx.db, input.organizationIds);
      await ctx.db
        .delete(dashboardChartAssignments)
        .where(eq(dashboardChartAssignments.chartId, input.id));
      if (input.organizationIds.length) {
        await ctx.db.insert(dashboardChartAssignments).values(
          input.organizationIds.map((organizationId) => ({
            chartId: input.id,
            organizationId,
          })),
        );
      }
      return { ok: true };
    }),
});
