import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, orgProcedure, adminProcedure } from "@/server/trpc";
import {
  tariffMappings,
  tariffCategories,
  tariffs,
  managementSystems,
  organizationPriorityProducts,
} from "@/server/db/schema";
import { eq, and, asc } from "drizzle-orm";

export const tariffRouter = createTRPCRouter({
  /**
   * Configuración de SIG de la organización para un producto prioritario.
   *
   * `activeSystemId` null (o sin fila) significa **libre**: la plataforma no
   * fija un SIG y las pantallas calculan contra todos los del producto
   * prioritario, para poder comparar.
   */
  sigConfig: orgProcedure
    .input(z.object({ priorityProductId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const systems = await ctx.db
        .select({
          id: managementSystems.id,
          name: managementSystems.name,
        })
        .from(managementSystems)
        .where(
          and(
            eq(managementSystems.priorityProductId, input.priorityProductId),
            eq(managementSystems.isActive, true)
          )
        )
        .orderBy(asc(managementSystems.name));

      if (!ctx.orgDbId) return { activeSystemId: null, systems };

      const row = await ctx.db.query.organizationPriorityProducts.findFirst({
        where: (o, { eq: _eq, and: _and }) =>
          _and(
            _eq(o.organizationId, ctx.orgDbId!),
            _eq(o.priorityProductId, input.priorityProductId)
          ),
      });

      return { activeSystemId: row?.activeSystemId ?? null, systems };
    }),

  /**
   * Fija el SIG de la organización, o lo deja libre con systemId = null.
   *
   * En modo libre, `getCostRows` cruza cada pieza contra todos los SIG del
   * producto prioritario en vez de uno solo.
   */
  setSig: adminProcedure
    .input(
      z.object({
        priorityProductId: z.string().uuid(),
        systemId: z.string().uuid().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.orgDbId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Sin organización activa",
        });
      }

      // El SIG debe pertenecer al producto prioritario que se está configurando
      if (input.systemId) {
        const sys = await ctx.db.query.managementSystems.findFirst({
          where: eq(managementSystems.id, input.systemId),
        });
        if (!sys || sys.priorityProductId !== input.priorityProductId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Ese SIG no corresponde al producto prioritario",
          });
        }
      }

      await ctx.db
        .insert(organizationPriorityProducts)
        .values({
          organizationId: ctx.orgDbId,
          priorityProductId: input.priorityProductId,
          activeSystemId: input.systemId,
        })
        .onConflictDoUpdate({
          target: [
            organizationPriorityProducts.organizationId,
            organizationPriorityProducts.priorityProductId,
          ],
          set: {
            activeSystemId: input.systemId,
            isActive: true,
            updatedAt: new Date(),
          },
        });

      return { activeSystemId: input.systemId };
    }),

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

  listSystems: orgProcedure
    .input(z.object({ priorityProductId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.managementSystems.findMany({
        where: (s, { eq: _eq, and: _and }) =>
          _and(
            _eq(s.isActive, true),
            input?.priorityProductId ? _eq(s.priorityProductId, input.priorityProductId) : undefined,
          ),
        with: {
          tariffCategories: {
            with: { tariffs: true },
            orderBy: (tc, { asc }) => [asc(tc.segment), asc(tc.material), asc(tc.subcategory)],
          },
        },
        orderBy: (s, { asc }) => [asc(s.name)],
      });
    }),

  createCategory: adminProcedure
    .input(z.object({
      systemId: z.string().uuid(),
      segment: z.string().min(1),
      material: z.string().min(1),
      subcategory: z.string().min(1),
      tariffType: z.string().default("Normal"),
      year: z.number().int(),
      rateUfPerTon: z.string(),
      rateUnit: z.string().default("UF/ton"),
      plusIva: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const lookupKey = `${input.segment}|${input.material}|${input.tariffType}`;
      const [cat] = await ctx.db.insert(tariffCategories).values({
        systemId: input.systemId,
        segment: input.segment,
        material: input.material,
        subcategory: input.subcategory,
        tariffType: input.tariffType,
        lookupKey,
      }).returning();

      const [tariff] = await ctx.db.insert(tariffs).values({
        categoryId: cat.id,
        year: input.year,
        rateUfPerTon: input.rateUfPerTon,
        rateValue: input.rateUfPerTon,
        rateUnit: input.rateUnit,
        plusIva: input.plusIva,
      }).returning();

      return { category: cat, tariff };
    }),

  updateTariff: adminProcedure
    .input(z.object({
      tariffId: z.string().uuid(),
      rateUfPerTon: z.string(),
      rateUnit: z.string().optional(),
      plusIva: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // rateValue se deriva SIEMPRE de rateUfPerTon (input acepta una sola fuente)
      const [row] = await ctx.db.update(tariffs).set({
        rateUfPerTon: input.rateUfPerTon,
        rateValue: input.rateUfPerTon,
        rateUnit: input.rateUnit,
        plusIva: input.plusIva,
      }).where(eq(tariffs.id, input.tariffId)).returning();
      return row;
    }),

  updateCategory: adminProcedure
    .input(z.object({
      categoryId: z.string().uuid(),
      material: z.string().min(1).optional(),
      subcategory: z.string().min(1).optional(),
      segment: z.string().min(1).optional(),
      tariffType: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { categoryId, ...rest } = input;
      const setValues: Record<string, unknown> = {};
      if (rest.material !== undefined) setValues.material = rest.material;
      if (rest.subcategory !== undefined) setValues.subcategory = rest.subcategory;
      if (rest.segment !== undefined) setValues.segment = rest.segment;
      if (rest.tariffType !== undefined) setValues.tariffType = rest.tariffType;
      const [row] = await ctx.db.update(tariffCategories).set(setValues)
        .where(eq(tariffCategories.id, categoryId)).returning();
      return row;
    }),

  deleteCategory: adminProcedure
    .input(z.object({ categoryId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(tariffCategories).where(eq(tariffCategories.id, input.categoryId));
      return { ok: true };
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
