import { z } from "zod";
import { createTRPCRouter, orgProcedure } from "@/server/trpc";
import {
  products,
  productPieces,
  salesRecords,
  productTypeEnum,
} from "@/server/db/schema";
import { eq, and, sql, asc } from "drizzle-orm";

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
      const { pieces, unitsSold, salesYear, priorityProductCode, ...productData } =
        input;

      // Sin org activa (desarrollo): asignar a la primera organización
      let orgId = ctx.orgDbId;
      if (!orgId) {
        const [firstOrg] = await ctx.db.query.organizations.findMany({ limit: 1 });
        if (!firstOrg) throw new Error("No existe ninguna organización");
        orgId = firstOrg.id;
      }

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

        if (unitsSold !== undefined && salesYear) {
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
      const { pieces, unitsSold, salesYear, priorityProductCode, ...productData } =
        input.data;

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
              ctx.orgDbId ? eq(products.organizationId, ctx.orgDbId) : undefined
            )
          )
          .returning();

        if (!product) {
          throw new Error("Producto no encontrado o no pertenece a tu organización");
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

        // Upsert ventas
        if (unitsSold !== undefined && salesYear) {
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

