import { createTRPCRouter } from "@/server/trpc";
import { healthRouter } from "./health";
import { productRouter } from "./product";
import { costsRouter } from "./costs";
import { tariffRouter } from "./tariff";
import { ufRouter } from "./uf";
import { priorityProductRouter } from "./priority-product";
import { dashboardChartsRouter } from "./dashboard-charts";
import { superAdminRouter } from "./_superadmin";
import { enterpriseRouter } from "./_enterprise";
import { authRouter } from "./auth";
import { industrialWasteRouter } from "./industrial-waste";

/**
 * Root router — agrega subrouters aquí.
 */
export const appRouter = createTRPCRouter({
  health: healthRouter,
  auth: authRouter,
  product: productRouter,
  costs: costsRouter,
  tariff: tariffRouter,
  uf: ufRouter,
  priorityProduct: priorityProductRouter,
  dashboardCharts: dashboardChartsRouter,
  superadmin: superAdminRouter,
  enterprise: enterpriseRouter,
  industrialWaste: industrialWasteRouter,
});

export type AppRouter = typeof appRouter;
