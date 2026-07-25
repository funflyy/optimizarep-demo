import { createTRPCRouter } from "@/server/trpc";
import { healthRouter } from "./health";
import { productRouter } from "./product";
import { costsRouter } from "./costs";
import { tariffRouter } from "./tariff";
import { ufRouter } from "./uf";
import { priorityProductRouter } from "./priority-product";

/**
 * Root router — agrega subrouters aquí.
 */
export const appRouter = createTRPCRouter({
  health: healthRouter,
  product: productRouter,
  costs: costsRouter,
  tariff: tariffRouter,
  uf: ufRouter,
  priorityProduct: priorityProductRouter,
});

export type AppRouter = typeof appRouter;
