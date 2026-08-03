import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, orgProcedure } from "@/server/trpc";
import { resolveTargetOrg } from "@/server/authz";
import {
  products,
  productPieces,
  salesRecords,
  productTypeEnum,
} from "@/server/db/schema";
import { eq, and, sql, asc, inArray } from "drizzle-orm";

/** Validación de una pieza/componente */
const pieceSchema = z.object({
  pieceName: z.string().min(1, "Nombre requerido"),
  packagingType: z.enum(["primary", "secondary", "tertiary"]),
  isDomiciliary: z.boolean().default(true),
  materialClass: z.string().min(1),
  wasteType: z.enum(["recyclable", "non_recyclable"]).default("recyclable"),
  materialDetail: z.string().min(1),
  weightGrams: z.number().positive("Peso debe ser > 0"),
  /** Peso en la unidad nativa del producto prioritario (kg, L...) */
  weightValue: z.number().positive().optional(),
  weightUnit: z.string().default("g"),
  /** Categoría legal REP (A/B, Cat.1-6, Recuperable, AIT...) */
  repCategoryId: z.string().uuid().optional(),
  hasGrease: z.boolean().default(false),
  isHazardous: z.boolean().default(false),
  plasticCharacteristic: z.string().optional(),
});

/** Validación de producto completo */
const productInputSchema = z.object({
  /**
   * Organización destino. Solo la pueden usar superadmin (cualquiera) y
   * enterprise_admin (las de su enterprise); el resto escribe en la propia.
   * Si se omite, se usa la organización del usuario.
   */
  organizationId: z.string().uuid().optional(),
  sku: z.string().min(1, "SKU requerido"),
  name: z.string().min(1, "Nombre requerido"),
  brand: z.string().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  priorityProduct: z.string().default("Envases y Embalajes"),
  /** Código del producto prioritario del catálogo dinámico */
  priorityProductCode: z.string().optional(),
  observations: z.string().optional(),
  pieces: z.array(pieceSchema).min(1, "Al menos 1 pieza requerida"),
  unitsSold: z.number().int().nonnegative().optional(),
  salesYear: z.number().int().min(2019).max(2030).optional(),
  /**
   * Ventas por período. Alternativa a unitsSold + salesYear para cargas que
   * traen varios meses (month: 0 = anual, 1-12 = mensual).
   */
  sales: z
    .array(
      z.object({
        year: z.number().int().min(2019).max(2030),
        month: z.number().int().min(0).max(12).default(0),
        unitsSold: z.number().int().nonnegative(),
      })
    )
    .optional(),
});

/** Resuelve código de producto prioritario → { id, productType enum } */
async function resolvePriorityProduct(
  db: typeof import("@/server/db").db,
  code: string | undefined
) {
  if (!code)
    return {
      priorityProductId: null,
      productType: undefined,
      salesUnit: "unidades",
    };
  const pp = await db.query.priorityProducts.findFirst({
    where: (p, { eq }) => eq(p.code, code),
  });
  const legacy: Record<string, string> = { pilas_aee: "pilas" };
  const enumValue = (legacy[code] ?? code) as
    (typeof productTypeEnum.enumValues)[number];
  return {
    priorityProductId: pp?.id ?? null,
    productType: productTypeEnum.enumValues.includes(enumValue)
      ? enumValue
      : undefined,
    salesUnit: pp?.nativeUnit === "L" ? "litros" : "unidades",
  };
}

export const productRouter = createTRPCRouter({
  /** Listar productos con paginación y búsqueda — filtrado por org */
  list: orgProcedure
    .input(
      z.object({
        search: z.string().optional(),
        category: z.string().optional(),
        /** Filtro por producto prioritario (enum legacy product_type) */
        productType: z.string().optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(50),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { search, category, productType, page = 1, limit = 50 } = input ?? {};

      const allProducts = await ctx.db.query.products.findMany({
        with: { pieces: true, salesRecords: true },
        where: (p, { and: _and, eq: _eq }) => {
          const conditions = [];
          if (ctx.orgDbId) conditions.push(_eq(p.organizationId, ctx.orgDbId));
          if (productType)
            conditions.push(
              _eq(
                p.productType,
                productType as (typeof productTypeEnum.enumValues)[number]
              )
            );
          if (search) {
            conditions.push(
              sql`(${p.sku} ILIKE ${"%" + search + "%"} OR ${p.name} ILIKE ${"%" + search + "%"})`
            );
          }
          if (category) conditions.push(_eq(p.category, category));
          return _and(...conditions);
        },
        orderBy: (p, { asc }) => [asc(p.sku)],
        limit,
        offset: (page - 1) * limit,
      });

      return { products: allProducts, page, limit };
    }),

  /**
   * SKUs que ya existen en la organización destino.
   *
   * La importación lo consulta antes de cargar: `(organizationId, sku)` es
   * único, así que reimportar un archivo ya cargado fallaba en cada fila con un
   * volcado de SQL. Con esto se distingue "nuevo" de "ya existe" y se ofrece
   * actualizar en vez de reventar.
   */
  existing: orgProcedure
    .input(
      z.object({
        skus: z.array(z.string().min(1)).max(5000),
        organizationId: z.string().uuid().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (input.skus.length === 0) return [];
      const orgId = await resolveTargetOrg(ctx.db, ctx, input.organizationId);
      return ctx.db
        .select({ id: products.id, sku: products.sku })
        .from(products)
        .where(
          and(
            eq(products.organizationId, orgId),
            inArray(products.sku, input.skus)
          )
        );
    }),

  /** Obtener categorías únicas para filtro — filtrado por org */
  categories: orgProcedure.query(async ({ ctx }) => {
    const result = await ctx.db
      .selectDistinct({ category: products.category })
      .from(products)
      .where(
        and(
          ctx.orgDbId ? eq(products.organizationId, ctx.orgDbId) : undefined,
          sql`${products.category} IS NOT NULL`
        )
      )
      .orderBy(asc(products.category));
    return result.map((r) => r.category).filter(Boolean) as string[];
  }),

  /** Obtener un producto por ID — verifica ownership */
  getById: orgProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.products.findFirst({
        where: (p, { and: _and, eq: _eq }) =>
          _and(
            _eq(p.id, input.id),
            ctx.orgDbId ? _eq(p.organizationId, ctx.orgDbId) : undefined
          ),
        with: { pieces: true, salesRecords: true },
      });
    }),

  /** Crear producto con piezas — asigna a la org del usuario */
  create: orgProcedure
    .input(productInputSchema)
    .mutation(async ({ ctx, input }) => {
      const {
        pieces,
        unitsSold,
        salesYear,
        sales,
        priorityProductCode,
        organizationId,
        ...productData
      } = input;

      // Valida el permiso sobre la org destino (misma regla que writableOrgs)
      const orgId = await resolveTargetOrg(ctx.db, ctx, organizationId);

      const { priorityProductId, productType, salesUnit } =
        await resolvePriorityProduct(ctx.db, priorityProductCode);

      return ctx.db.transaction(async (tx) => {
        const [product] = await tx
          .insert(products)
          .values({
            ...productData,
            organizationId: orgId,
            priorityProductId,
            ...(productType ? { productType } : {}),
          })
          .returning();

        if (pieces.length > 0) {
          await tx.insert(productPieces).values(
            pieces.map((p) => ({ ...p, productId: product.id }))
          );
        }

        if (sales && sales.length > 0) {
          await tx
            .insert(salesRecords)
            .values(
              sales.map((s) => ({
                productId: product.id,
                year: s.year,
                month: s.month,
                unitsSold: s.unitsSold,
                unit: salesUnit,
              }))
            )
            .onConflictDoNothing();
        } else if (unitsSold !== undefined && salesYear) {
          await tx.insert(salesRecords).values({
            productId: product.id,
            year: salesYear,
            unitsSold,
            unit: salesUnit,
          });
        }

        return product;
      });
    }),

  /** Actualizar producto con piezas — verifica ownership */
  update: orgProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: productInputSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        pieces,
        unitsSold,
        salesYear,
        sales,
        priorityProductCode,
        organizationId,
        ...productData
      } = input.data;

      // Misma regla de permiso que en create. Antes el WHERE de abajo usaba
      // solo ctx.orgDbId, así que un superadmin que actualizara un producto de
      // otra organización no lo encontraba. `organizationId` acota la búsqueda,
      // no mueve el producto: si no pertenece a esa org, no hay match.
      const orgId = await resolveTargetOrg(ctx.db, ctx, organizationId);

      const { priorityProductId, productType, salesUnit } =
        await resolvePriorityProduct(ctx.db, priorityProductCode);

      return ctx.db.transaction(async (tx) => {
        const [product] = await tx
          .update(products)
          .set({
            ...productData,
            ...(priorityProductId ? { priorityProductId } : {}),
            ...(productType ? { productType } : {}),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(products.id, input.id),
              eq(products.organizationId, orgId)
            )
          )
          .returning();

        if (!product) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Producto no encontrado o no pertenece a esa organización",
          });
        }

        // Reemplazar piezas (delete + insert)
        await tx
          .delete(productPieces)
          .where(eq(productPieces.productId, input.id));

        if (pieces.length > 0) {
          await tx.insert(productPieces).values(
            pieces.map((p) => ({ ...p, productId: input.id }))
          );
        }

        // Upsert ventas — por período si vienen varios, si no el legacy anual
        if (sales && sales.length > 0) {
          for (const s of sales) {
            await tx
              .insert(salesRecords)
              .values({
                productId: input.id,
                year: s.year,
                month: s.month,
                unitsSold: s.unitsSold,
                unit: salesUnit,
              })
              .onConflictDoUpdate({
                target: [
                  salesRecords.productId,
                  salesRecords.year,
                  salesRecords.month,
                ],
                set: { unitsSold: s.unitsSold, updatedAt: new Date() },
              });
          }
        } else if (unitsSold !== undefined && salesYear) {
          await tx
            .insert(salesRecords)
            .values({ productId: input.id, year: salesYear, unitsSold, unit: salesUnit })
            .onConflictDoUpdate({
              target: [
                salesRecords.productId,
                salesRecords.year,
                salesRecords.month,
              ],
              set: { unitsSold, updatedAt: new Date() },
            });
        }

        return product;
      });
    }),

  /** Eliminar producto — verifica ownership */
  delete: orgProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(products)
        .where(
          and(
            eq(products.id, input.id),
            ctx.orgDbId ? eq(products.organizationId, ctx.orgDbId) : undefined
          )
        );
      return { success: true };
    }),
});

