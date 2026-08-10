/**
 * Gestión Industrial ("Patio Trasero").
 *
 * Los residuos que el productor entrega a gestores y declara al SINADER. Se
 * alimenta aparte de la línea base de envases: no es puesta en mercado, es
 * retiro de residuo, y por eso no participa del cálculo de tarifas REP.
 *
 * El formato de registro es el que definió MB: año, mes, LER, residuo, RUT del
 * gestor, planta destino, ID de Ventanilla Única, código y descripción del
 * tratamiento, y kilos totales.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, orgProcedure } from "@/server/trpc";
import { industrialWaste, lerCodes } from "@/server/db/schema";
import { and, asc, desc, eq, sum } from "drizzle-orm";
import { recordAudit } from "@/server/audit";
import { resolveTargetOrg } from "@/server/authz";

const wasteInput = z.object({
  /** Fecha del retiro */
  wasteDate: z.coerce.date(),
  lerCode: z.string().min(1, "El código LER es obligatorio"),
  wasteName: z.string().min(1, "La descripción del residuo es obligatoria"),
  handlerRut: z.string().optional(),
  handlerName: z.string().optional(),
  destinationPlant: z.string().optional(),
  singleWindowId: z.string().optional(),
  treatmentCode: z.string().optional(),
  treatmentDescription: z.string().optional(),
  /** Kilos totales entregados */
  totalKg: z.number().positive("Los kilos deben ser mayores que cero"),
  observations: z.string().optional(),
  organizationId: z.string().uuid().optional(),
});

export const industrialWasteRouter = createTRPCRouter({
  /** Catálogo LER, para los selectores */
  lerCatalog: orgProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: lerCodes.id,
        code: lerCodes.code,
        description: lerCodes.description,
      })
      .from(lerCodes)
      .where(eq(lerCodes.isActive, true))
      .orderBy(asc(lerCodes.sortOrder));
  }),

  /** Registros del período, del más reciente al más antiguo */
  list: orgProcedure
    .input(
      z
        .object({
          year: z.number().int().optional(),
          month: z.number().int().min(1).max(12).optional(),
          lerCode: z.string().optional(),
          limit: z.number().int().min(1).max(500).default(200),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const { year, month, lerCode, limit = 200 } = input ?? {};
      return ctx.db
        .select()
        .from(industrialWaste)
        .where(
          and(
            ctx.orgDbId
              ? eq(industrialWaste.organizationId, ctx.orgDbId)
              : undefined,
            year ? eq(industrialWaste.year, year) : undefined,
            month ? eq(industrialWaste.month, month) : undefined,
            lerCode ? eq(industrialWaste.lerCode, lerCode) : undefined
          )
        )
        .orderBy(desc(industrialWaste.wasteDate))
        .limit(limit);
    }),

  /**
   * Totales por LER, que es la agrupación con la que se declara al SINADER:
   * un registro por código de residuo y período.
   */
  summaryByLer: orgProcedure
    .input(z.object({ year: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          lerCode: industrialWaste.lerCode,
          wasteName: industrialWaste.wasteName,
          totalKg: sum(industrialWaste.totalKg),
        })
        .from(industrialWaste)
        .where(
          and(
            ctx.orgDbId
              ? eq(industrialWaste.organizationId, ctx.orgDbId)
              : undefined,
            input?.year ? eq(industrialWaste.year, input.year) : undefined
          )
        )
        .groupBy(industrialWaste.lerCode, industrialWaste.wasteName)
        .orderBy(asc(industrialWaste.lerCode));

      return rows.map((r) => ({
        lerCode: r.lerCode,
        wasteName: r.wasteName,
        totalKg: Number(r.totalKg ?? 0),
        totalTons: Math.round((Number(r.totalKg ?? 0) / 1000) * 1000) / 1000,
      }));
    }),

  /** Años con registros, para el filtro */
  availableYears: orgProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .selectDistinct({ year: industrialWaste.year })
      .from(industrialWaste)
      .where(
        ctx.orgDbId
          ? eq(industrialWaste.organizationId, ctx.orgDbId)
          : undefined
      )
      .orderBy(desc(industrialWaste.year));
    return rows.map((r) => r.year);
  }),

  create: orgProcedure.input(wasteInput).mutation(async ({ ctx, input }) => {
    const { organizationId, wasteDate, totalKg, ...rest } = input;
    const orgId = await resolveTargetOrg(ctx.db, ctx, organizationId);

    // El código LER se guarda desnormalizado además de la FK: lo declarado no
    // debe cambiar si el catálogo se corrige después.
    const ler = await ctx.db.query.lerCodes.findFirst({
      where: eq(lerCodes.code, input.lerCode),
    });

    const [row] = await ctx.db
      .insert(industrialWaste)
      .values({
        ...rest,
        organizationId: orgId,
        wasteDate,
        year: wasteDate.getFullYear(),
        month: wasteDate.getMonth() + 1,
        lerCodeId: ler?.id ?? null,
        totalKg: String(totalKg),
        createdBy: ctx.user.id,
      })
      .returning();

    await recordAudit(ctx.db, {
      organizationId: orgId,
      userId: ctx.user.id,
      entity: "industrial_waste",
      entityId: row.id,
      action: "create",
      changes: {
        ler: row.lerCode,
        residuo: row.wasteName,
        kilos: totalKg,
        periodo: `${row.year}-${String(row.month).padStart(2, "0")}`,
      },
    });

    return row;
  }),

  update: orgProcedure
    .input(z.object({ id: z.string().uuid(), data: wasteInput }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId, wasteDate, totalKg, ...rest } = input.data;
      const orgId = await resolveTargetOrg(ctx.db, ctx, organizationId);

      const ler = await ctx.db.query.lerCodes.findFirst({
        where: eq(lerCodes.code, input.data.lerCode),
      });

      const [row] = await ctx.db
        .update(industrialWaste)
        .set({
          ...rest,
          wasteDate,
          year: wasteDate.getFullYear(),
          month: wasteDate.getMonth() + 1,
          lerCodeId: ler?.id ?? null,
          totalKg: String(totalKg),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(industrialWaste.id, input.id),
            eq(industrialWaste.organizationId, orgId)
          )
        )
        .returning();

      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Registro no encontrado en esta organización",
        });
      }

      await recordAudit(ctx.db, {
        organizationId: orgId,
        userId: ctx.user.id,
        entity: "industrial_waste",
        entityId: row.id,
        action: "update",
        changes: { ler: row.lerCode, kilos: totalKg },
      });

      return row;
    }),

  delete: orgProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .delete(industrialWaste)
        .where(
          and(
            eq(industrialWaste.id, input.id),
            ctx.orgDbId
              ? eq(industrialWaste.organizationId, ctx.orgDbId)
              : undefined
          )
        )
        .returning();

      if (row) {
        await recordAudit(ctx.db, {
          organizationId: row.organizationId,
          userId: ctx.user.id,
          entity: "industrial_waste",
          entityId: row.id,
          action: "delete",
          changes: { ler: row.lerCode, kilos: row.totalKg },
        });
      }

      return { success: true };
    }),
});
