import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { createTRPCRouter, orgProcedure, adminProcedure } from "@/server/trpc";
import {
  dashboardCharts,
  dashboardChartAssignments,
} from "@/server/db/schema";
import { getVisibleCharts } from "@/lib/dashboard-charts";
import { ChartConfigInputSchema } from "@/lib/chart-types";

export const dashboardChartsRouter = createTRPCRouter({
  list: orgProcedure.query(async ({ ctx }) => {
    return getVisibleCharts(ctx.orgDbId);
  }),

  get: orgProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const visible = await getVisibleCharts(ctx.orgDbId);
      const chart = visible.find((c) => c.id === input.id);
      if (!chart) throw new TRPCError({ code: "NOT_FOUND" });
      return chart;
    }),

  create: adminProcedure
    .input(ChartConfigInputSchema)
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(dashboardCharts)
        .values({
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
        await ctx.db.insert(dashboardChartAssignments).values(
          input.organizationIds.map((organizationId) => ({
            chartId: row.id,
            organizationId,
          })),
        );
      }
      return row;
    }),

  update: adminProcedure
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

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(dashboardCharts)
        .where(eq(dashboardCharts.id, input.id));
      return { id: input.id };
    }),

  reorder: adminProcedure
    .input(
      z.array(z.object({ id: z.string().uuid(), position: z.number().int() })),
    )
    .mutation(async ({ ctx, input }) => {
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

  assign: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        organizationIds: z.array(z.string().uuid()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
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

  listOrganizations: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.query.organizations.findMany({
      columns: { id: true, name: true, rut: true },
      orderBy: (o, { asc }) => asc(o.name),
    });
  }),
});
