import { createTRPCRouter, publicProcedure } from "@/server/trpc";

export const healthRouter = createTRPCRouter({
  check: publicProcedure.query(() => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "0.1.0",
    };
  }),
});
