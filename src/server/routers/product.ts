import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, orgProcedure } from "@/server/trpc";
import { resolveTargetOrg } from "@/server/authz";
import {
  products,
  productPieces,
  salesRecords,
  productTypeEnum,
  auditLog,
  users,
} from "@/server/db/schema";
import { eq, and, sql, asc, desc, inArray } from "drizzle-orm";
import { recordAudit } from "@/server/audit";

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
        /**
         * Segmento al que aplican las unidades. Un mismo mes trae dos cifras:
         * las unidades de venta al detalle y los pallets que las transportan.
         */
        segment: z
          .enum(["Domiciliario", "No Domiciliario"])
          .default("Domiciliario"),
        unitsSold: z.number().int().nonnegative(),
      })
    )
    .optional(),
});

/**
 * Sin código explícito se asume el mismo default que `products.productType`.
 *
 * Antes, sin código, `priorityProductId` quedaba en NULL. La importación de
 * Excel no envía `priorityProductCode`, así que los 63 productos cargados
 * tenían el enum correcto pero el FK vacío — y las pantallas que filtran por
 * el FK (Mapeo de Materiales, Resumen Ejecutivo) mostraban 0 productos.
 */
const DEFAULT_PRIORITY_PRODUCT_CODE = "envases_embalajes";

/** Resuelve código de producto prioritario → { id, productType enum } */
async function resolvePriorityProduct(
  db: typeof import("@/server/db").db,
  code: string | undefined
) {
  const effectiveCode = code ?? DEFAULT_PRIORITY_PRODUCT_CODE;
  const pp = await db.query.priorityProducts.findFirst({
    where: (p, { eq }) => eq(p.code, effectiveCode),
  });
  const legacy: Record<string, string> = { pilas_aee: "pilas" };
  const enumValue = (legacy[effectiveCode] ?? effectiveCode) as
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

      const created = await ctx.db.transaction(async (tx) => {
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
                segment: s.segment,
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

      // Respaldo de quién creó el SKU y cuándo: es parte de lo declarado
      await recordAudit(ctx.db, {
        organizationId: orgId,
        userId: ctx.user.id,
        entity: "products",
        entityId: created.id,
        action: "create",
        changes: {
          sku: created.sku,
          name: created.name,
          pieces: pieces.length,
          periodos: sales?.length ?? 0,
        },
      });

      return created;
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

      // Estado anterior, para poder mostrar qué cambió
      const before = await ctx.db.query.products.findFirst({
        where: (p, { eq: _eq }) => _eq(p.id, input.id),
        with: { pieces: true },
      });

      const updated = await ctx.db.transaction(async (tx) => {
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

        // Upsert ventas — por período y segmento si vienen varios, si no el
        // legacy anual. El índice único incluye el segmento.
        if (sales && sales.length > 0) {
          for (const s of sales) {
            await tx
              .insert(salesRecords)
              .values({
                productId: input.id,
                year: s.year,
                month: s.month,
                segment: s.segment,
                unitsSold: s.unitsSold,
                unit: salesUnit,
              })
              .onConflictDoUpdate({
                target: [
                  salesRecords.productId,
                  salesRecords.year,
                  salesRecords.month,
                  salesRecords.segment,
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
                salesRecords.segment,
              ],
              set: { unitsSold, updatedAt: new Date() },
            });
        }

        return product;
      });

      // Respaldo del cambio: quién, cuándo y qué campos se movieron
      const cambios: Record<string, unknown> = { sku: updated.sku };
      if (before) {
        for (const campo of [
          "name",
          "brand",
          "category",
          "subcategory",
          "family",
          "subfamily",
        ] as const) {
          if (before[campo] !== updated[campo]) {
            cambios[campo] = { antes: before[campo], ahora: updated[campo] };
          }
        }
        if (before.pieces.length !== pieces.length) {
          cambios.piezas = {
            antes: before.pieces.length,
            ahora: pieces.length,
          };
        }
      }

      await recordAudit(ctx.db, {
        organizationId: updated.organizationId,
        userId: ctx.user.id,
        entity: "products",
        entityId: updated.id,
        action: "update",
        changes: cambios,
      });

      return updated;
    }),

  /**
   * Crea un SKU nuevo a partir de otro, copiando su envase.
   *
   * Es el caso real de las réplicas: muchos SKU comparten exactamente el mismo
   * envase (la misma botella para diez sabores) y volver a declarar pieza por
   * pieza es trabajo duplicado y una fuente de inconsistencias.
   *
   * NO copia las ventas: el volumen es propio de cada SKU. Copia el envase y
   * los datos comerciales que se le pasen.
   */
  duplicateFrom: orgProcedure
    .input(
      z.object({
        sourceSku: z.string().min(1),
        newSku: z.string().min(1),
        newName: z.string().min(1),
        brand: z.string().optional(),
        category: z.string().optional(),
        subcategory: z.string().optional(),
        family: z.string().optional(),
        subfamily: z.string().optional(),
        organizationId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = await resolveTargetOrg(ctx.db, ctx, input.organizationId);

      if (input.newSku.trim() === input.sourceSku.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El SKU nuevo y el de origen son el mismo",
        });
      }

      const source = await ctx.db.query.products.findFirst({
        where: (p, { eq: _eq, and: _and }) =>
          _and(_eq(p.sku, input.sourceSku), _eq(p.organizationId, orgId)),
        with: { pieces: true },
      });
      if (!source) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No existe el SKU ${input.sourceSku} en esta organización`,
        });
      }
      if (source.pieces.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `El SKU ${input.sourceSku} no tiene piezas que copiar`,
        });
      }

      const yaExiste = await ctx.db.query.products.findFirst({
        where: (p, { eq: _eq, and: _and }) =>
          _and(_eq(p.sku, input.newSku), _eq(p.organizationId, orgId)),
      });
      if (yaExiste) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `El SKU ${input.newSku} ya existe en esta organización`,
        });
      }

      // Si el origen ya era réplica, el original es su original: no se
      // encadenan copias de copias.
      const originalSku = source.isReplica
        ? (source.originalSku ?? source.sku)
        : source.sku;

      const creado = await ctx.db.transaction(async (tx) => {
        const [nuevo] = await tx
          .insert(products)
          .values({
            organizationId: orgId,
            sku: input.newSku,
            name: input.newName,
            brand: input.brand ?? source.brand,
            category: input.category ?? source.category,
            subcategory: input.subcategory ?? source.subcategory,
            family: input.family ?? source.family,
            subfamily: input.subfamily ?? source.subfamily,
            productType: source.productType,
            priorityProduct: source.priorityProduct,
            priorityProductId: source.priorityProductId,
            isReplica: true,
            originalSku,
          })
          .returning();

        await tx.insert(productPieces).values(
          source.pieces.map((p) => ({
            productId: nuevo.id,
            pieceName: p.pieceName,
            packagingType: p.packagingType,
            isDomiciliary: p.isDomiciliary,
            materialClass: p.materialClass,
            wasteType: p.wasteType,
            materialDetail: p.materialDetail,
            weightGrams: p.weightGrams,
            weightValue: p.weightValue,
            weightUnit: p.weightUnit,
            categoryLevel1: p.categoryLevel1,
            categoryLevel2: p.categoryLevel2,
            metadata: p.metadata,
            hasGrease: p.hasGrease,
            isHazardous: p.isHazardous,
            plasticCharacteristic: p.plasticCharacteristic,
            repCategoryId: p.repCategoryId,
            notSubjectToRep: p.notSubjectToRep,
            exemptionReason: p.exemptionReason,
            hasRecycledMaterial: p.hasRecycledMaterial,
            recycledPercentage: p.recycledPercentage,
            recycledOrigin: p.recycledOrigin,
            isReplica: true,
            originalSku,
          }))
        );

        return nuevo;
      });

      await recordAudit(ctx.db, {
        organizationId: orgId,
        userId: ctx.user.id,
        entity: "products",
        entityId: creado.id,
        action: "create",
        changes: {
          sku: creado.sku,
          creadoDesde: source.sku,
          originalSku,
          piezasCopiadas: source.pieces.length,
        },
      });

      return {
        id: creado.id,
        sku: creado.sku,
        originalSku,
        piecesCopied: source.pieces.length,
      };
    }),

  /**
   * Distribución de SKU originales vs réplicas.
   *
   * MB quiere vigilar la proporción: si muchos SKU se crearon duplicando,
   * conviene verificar que de verdad comparten las condiciones de envasado.
   */
  replicaStats: orgProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        isReplica: products.isReplica,
        originalSku: products.originalSku,
        sku: products.sku,
      })
      .from(products)
      .where(
        and(
          ctx.orgDbId ? eq(products.organizationId, ctx.orgDbId) : undefined,
          eq(products.isActive, true)
        )
      );

    const replicas = rows.filter((r) => r.isReplica);
    const total = rows.length;

    // Cuántas réplicas cuelgan de cada original, para saber dónde mirar
    const porOriginal = new Map<string, number>();
    for (const r of replicas) {
      const k = r.originalSku ?? "(sin origen)";
      porOriginal.set(k, (porOriginal.get(k) ?? 0) + 1);
    }

    return {
      total,
      originals: total - replicas.length,
      replicas: replicas.length,
      replicaShare:
        total > 0 ? Math.round((replicas.length / total) * 1000) / 10 : 0,
      topOriginals: [...porOriginal.entries()]
        .map(([originalSku, count]) => ({ originalSku, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };
  }),

  /**
   * Replica las piezas de otro SKU.
   *
   * El mismo envase se repite en muchos SKU (la misma botella para 10 sabores),
   * así que volver a declarar pieza por pieza es trabajo duplicado y una fuente
   * de inconsistencias. Las piezas copiadas quedan marcadas con
   * `isReplica` + `originalSku` para poder rastrear de dónde salieron.
   *
   * Reemplaza las piezas del destino, igual que `update`.
   */
  replicatePieces: orgProcedure
    .input(
      z.object({
        targetProductId: z.string().uuid(),
        sourceSku: z.string().min(1),
        organizationId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = await resolveTargetOrg(ctx.db, ctx, input.organizationId);

      const source = await ctx.db.query.products.findFirst({
        where: (p, { eq: _eq, and: _and }) =>
          _and(_eq(p.sku, input.sourceSku), _eq(p.organizationId, orgId)),
        with: { pieces: true },
      });
      if (!source) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No existe el SKU ${input.sourceSku} en esta organización`,
        });
      }
      if (source.pieces.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `El SKU ${input.sourceSku} no tiene piezas que copiar`,
        });
      }
      if (source.id === input.targetProductId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El origen y el destino son el mismo producto",
        });
      }

      const target = await ctx.db.query.products.findFirst({
        where: (p, { eq: _eq, and: _and }) =>
          _and(_eq(p.id, input.targetProductId), _eq(p.organizationId, orgId)),
      });
      if (!target) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Producto destino no encontrado en esta organización",
        });
      }

      const resultado = await ctx.db.transaction(async (tx) => {
        await tx
          .delete(productPieces)
          .where(eq(productPieces.productId, target.id));

        await tx.insert(productPieces).values(
          source.pieces.map((p) => ({
            productId: target.id,
            pieceName: p.pieceName,
            packagingType: p.packagingType,
            isDomiciliary: p.isDomiciliary,
            materialClass: p.materialClass,
            wasteType: p.wasteType,
            materialDetail: p.materialDetail,
            weightGrams: p.weightGrams,
            weightValue: p.weightValue,
            weightUnit: p.weightUnit,
            categoryLevel1: p.categoryLevel1,
            categoryLevel2: p.categoryLevel2,
            metadata: p.metadata,
            hasGrease: p.hasGrease,
            isHazardous: p.isHazardous,
            plasticCharacteristic: p.plasticCharacteristic,
            repCategoryId: p.repCategoryId,
            // Trazabilidad: de dónde se copió
            isReplica: true,
            originalSku: source.sku,
          }))
        );

        // La réplica también queda marcada en el producto, no solo en las
        // piezas: así se puede medir la proporción de réplicas del catálogo
        await tx
          .update(products)
          .set({
            isReplica: true,
            originalSku: source.sku,
            updatedAt: new Date(),
          })
          .where(eq(products.id, target.id));

        return {
          targetSku: target.sku,
          sourceSku: source.sku,
          piecesCopied: source.pieces.length,
        };
      });

      await recordAudit(ctx.db, {
        organizationId: orgId,
        userId: ctx.user.id,
        entity: "products",
        entityId: input.targetProductId,
        action: "update",
        changes: {
          sku: resultado.targetSku,
          replicaDe: resultado.sourceSku,
          piezasCopiadas: resultado.piecesCopied,
        },
      });

      return resultado;
    }),

  /**
   * Historial de cambios de la organización.
   *
   * MB necesita poder mostrar que fue el cliente quien creó o modificó un SKU,
   * con fecha y hora, porque eso respalda lo declarado.
   */
  auditTrail: orgProcedure
    .input(
      z
        .object({
          entity: z.string().optional(),
          limit: z.number().int().min(1).max(200).default(50),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const { entity, limit = 50 } = input ?? {};
      const rows = await ctx.db
        .select({
          id: auditLog.id,
          entity: auditLog.entity,
          entityId: auditLog.entityId,
          action: auditLog.action,
          changes: auditLog.changes,
          createdAt: auditLog.createdAt,
          userEmail: users.email,
          userFirstName: users.firstName,
          userLastName: users.lastName,
        })
        .from(auditLog)
        .leftJoin(users, eq(users.id, auditLog.userId))
        .where(
          and(
            ctx.orgDbId ? eq(auditLog.organizationId, ctx.orgDbId) : undefined,
            entity ? eq(auditLog.entity, entity) : undefined
          )
        )
        .orderBy(desc(auditLog.createdAt))
        .limit(limit);
      return rows;
    }),

  /** Eliminar producto — verifica ownership */
  delete: orgProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [borrado] = await ctx.db
        .delete(products)
        .where(
          and(
            eq(products.id, input.id),
            ctx.orgDbId ? eq(products.organizationId, ctx.orgDbId) : undefined
          )
        )
        .returning();

      if (borrado) {
        await recordAudit(ctx.db, {
          organizationId: borrado.organizationId,
          userId: ctx.user.id,
          entity: "products",
          entityId: borrado.id,
          action: "delete",
          changes: { sku: borrado.sku, name: borrado.name },
        });
      }

      return { success: true };
    }),
});

