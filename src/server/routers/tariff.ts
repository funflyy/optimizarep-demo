import { z } from "zod";
import { createTRPCRouter, orgProcedure } from "@/server/trpc";
import { tariffMappings } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";

export const tariffRouter = createTRPCRouter({
  /** Obtener todos los mapeos de la organización */
  getMappings: orgProcedure.query(async ({ ctx }) => {
    return ctx.db.query.tariffMappings.findMany({
      where: ctx.orgDbId
        ? (tm, { eq }) => eq(tm.organizationId, ctx.orgDbId!)
        : undefined,
    });
  }),

  /** Guardar o actualizar un mapeo */
  saveMapping: orgProcedure
    .input(
      z.object({
        systemId: z.string().uuid(),
        materialDetail: z.string(),
        segment: z.string(),
        tariffCategoryId: z.string().uuid(),
        hasGrease: z.boolean().default(false),
        isHazardous: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Sin org activa (desarrollo): usar la primera organización
      let orgId = ctx.orgDbId;
      if (!orgId) {
        const [firstOrg] = await ctx.db.query.organizations.findMany({ limit: 1 });
        if (!firstOrg) throw new Error("No existe ninguna organización");
        orgId = firstOrg.id;
      }

      // Intentar buscar si existe
      const existing = await ctx.db.query.tariffMappings.findFirst({
        where: (tm, { and: _and, eq: _eq }) =>
          _and(
            _eq(tm.organizationId, orgId!),
            _eq(tm.systemId, input.systemId),
            _eq(tm.materialDetail, input.materialDetail),
            _eq(tm.segment, input.segment),
            _eq(tm.hasGrease, input.hasGrease),
            _eq(tm.isHazardous, input.isHazardous)
          ),
      });

      if (existing) {
        // Actualizar
        const [updated] = await ctx.db
          .update(tariffMappings)
          .set({
            tariffCategoryId: input.tariffCategoryId,
            updatedAt: new Date(),
          })
          .where(eq(tariffMappings.id, existing.id))
          .returning();
        return updated;
      } else {
        // Crear
        const [inserted] = await ctx.db
          .insert(tariffMappings)
          .values({
            organizationId: orgId,
            systemId: input.systemId,
            materialDetail: input.materialDetail,
            segment: input.segment,
            hasGrease: input.hasGrease,
            isHazardous: input.isHazardous,
            tariffCategoryId: input.tariffCategoryId,
            isManual: true,
          })
          .returning();
        return inserted;
      }
    }),

  /** Eliminar un mapeo */
  deleteMapping: orgProcedure
    .input(
      z.object({
        systemId: z.string().uuid(),
        materialDetail: z.string(),
        segment: z.string(),
        hasGrease: z.boolean().default(false),
        isHazardous: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(tariffMappings)
        .where(
          and(
            ctx.orgDbId
              ? eq(tariffMappings.organizationId, ctx.orgDbId)
              : undefined,
            eq(tariffMappings.systemId, input.systemId),
            eq(tariffMappings.materialDetail, input.materialDetail),
            eq(tariffMappings.segment, input.segment),
            eq(tariffMappings.hasGrease, input.hasGrease),
            eq(tariffMappings.isHazardous, input.isHazardous)
          )
        );
      return { success: true };
    }),
});
