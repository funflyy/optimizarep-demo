import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/trpc";
import { db } from "@/server/db";

/**
 * Productos Prioritarios — catálogo normativo (Ley 20.920).
 * Acuerdo reunión 11-jul: cada empresa opera un producto prioritario a la
 * vez; al entrar se elige cuál ver y el menú se mueve dentro de ese contexto.
 * El vínculo por organización (organization_priority_products) se integra
 * en la Fase 3 junto con el multi-tenancy de Clerk.
 */
export const priorityProductRouter = createTRPCRouter({
  list: publicProcedure.query(async () => {
    const items = await db.query.priorityProducts.findMany({
      where: (pp, { eq }) => eq(pp.isActive, true),
      orderBy: (pp, { asc }) => [asc(pp.sortOrder)],
    });
    return items.map((pp) => ({
      id: pp.id,
      code: pp.code,
      name: pp.name,
      decree: pp.decree,
      legalBasis: pp.legalBasis,
      nativeUnit: pp.nativeUnit,
      goalsEffectiveFrom: pp.goalsEffectiveFrom,
    }));
  }),

  /** Categorías legales REP del producto prioritario (por código) */
  categories: publicProcedure
    .input(z.object({ code: z.string() }))
    .query(async ({ input }) => {
      const pp = await db.query.priorityProducts.findFirst({
        where: (p, { eq }) => eq(p.code, input.code),
      });
      if (!pp) return [];
      const cats = await db.query.repCategories.findMany({
        where: (c, { eq }) => eq(c.priorityProductId, pp.id),
        orderBy: (c, { asc }) => [asc(c.sortOrder)],
      });
      return cats.map((c) => ({
        id: c.id,
        code: c.code,
        subcategory: c.subcategory,
        description: c.description,
        wearFactor: c.wearFactor ? Number(c.wearFactor) : null,
        subjectToRep: c.subjectToRep,
      }));
    }),
});
