/**
 * costs.ts — Motor de cálculo REP
 *
 * Fórmula: Costo = Peso[g] × Ventas / 1.000.000 [→ ton] × Tarifa[UF/ton]
 *
 * El cálculo se hace por pieza:
 *   1. Cada pieza tiene un peso (g) y pertenece a un producto
 *   2. El producto tiene ventas por año (unidades)
 *   3. La pieza tiene un materialDetail + segmento que se mapea a una tariffCategory
 *   4. La tariffCategory tiene una tarifa (UF/ton) por año
 *   5. toneladas = pesoGramos × ventasUnidades / 1.000.000
 *   6. costoUF = toneladas × tarifaUFporTon
 */
import { z } from "zod";
import { createTRPCRouter, orgProcedure } from "@/server/trpc";
import { db } from "@/server/db";
import {
  products,
  productPieces,
  salesRecords,
  tariffs,
  tariffCategories,
  tariffMappings,
  managementSystems,
  organizationPriorityProducts,
  ufValues,
  priorityProducts,
  productTypeEnum,
} from "@/server/db/schema";
import { eq, and, or, isNull, sql, asc, desc } from "drizzle-orm";

// ── Types ────────────────────────────────────────────────────────
interface CostRow {
  productId: string;
  sku: string;
  productName: string;
  brand: string | null;
  category: string | null;
  productType: string;
  customData: Record<string, unknown> | null;
  pieceName: string;
  materialClass: string;
  materialDetail: string;
  isDomiciliary: boolean;
  weightGrams: number;
  weightUnit: string;
  salesYear: number;
  /** 0 = anual, 1-12 = mensual (las empresas declaran mes a mes) */
  salesMonth: number;
  unitsSold: number;
  systemName: string;
  rateUfPerTon: number;
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Calcula toneladas y costo UF para una fila.
 * weight_grams SIEMPRE está en gramos (el peso nativo va en weight_value).
 * Aceites (L): las "unidades vendidas" son LITROS comercializados →
 * ton = litros × densidad [kg/L] / 1.000 (D.S. 47/2023).
 */
function calcCost(row: CostRow) {
  let tons: number;
  if (row.weightUnit === "L") {
    const density =
      Number(String(row.customData?.densidad ?? "").replace(",", ".")) || 0.88;
    tons = (row.unitsSold * density) / 1_000;
  } else {
    tons = (row.weightGrams * row.unitsSold) / 1_000_000;
  }
  const costUf = tons * row.rateUfPerTon;
  return { tons, costUf };
}

/**
 * Agrega filas agrupando por SIG, sin sumar entre sistemas.
 *
 * En modo libre `getCostRows` emite una fila por cada SIG del producto
 * prioritario, así que sumar todas las filas cuenta lo mismo N veces: el
 * tonelaje se triplicaba (33.468 en vez de 11.156) y el "Costo REP Total" era
 * la suma de tres alternativas que la empresa nunca paga juntas — declara en
 * uno solo.
 *
 * El tonelaje NO depende del SIG (la misma pieza se declara una vez), así que
 * se toma el mayor entre sistemas, no la suma.
 */
function aggregateBySig(rows: CostRow[]) {
  const bySig = new Map<
    string,
    { tons: number; costUf: number; byMaterial: Map<string, { tons: number; costUf: number }> }
  >();

  for (const row of rows) {
    const { tons, costUf } = calcCost(row);
    let sig = bySig.get(row.systemName);
    if (!sig) {
      sig = { tons: 0, costUf: 0, byMaterial: new Map() };
      bySig.set(row.systemName, sig);
    }
    sig.tons += tons;
    sig.costUf += costUf;

    const mat = sig.byMaterial.get(row.materialClass) ?? { tons: 0, costUf: 0 };
    mat.tons += tons;
    mat.costUf += costUf;
    sig.byMaterial.set(row.materialClass, mat);
  }

  const sigs = [...bySig.entries()];

  /** Tonelaje declarado, contado una sola vez */
  const tons = sigs.length > 0 ? Math.max(...sigs.map(([, s]) => s.tons)) : 0;

  /**
   * SIG de referencia para los KPI de un solo número. Con un SIG filtrado es
   * ese; comparando varios se usa el más económico entre los que tienen tarifa,
   * y la UI lo rotula para no dar a entender que es "el" costo.
   */
  const withCost = sigs.filter(([, s]) => s.costUf > 0);
  const reference =
    withCost.length > 0
      ? withCost.reduce((a, b) => (b[1].costUf < a[1].costUf ? b : a))
      : sigs[0];

  return {
    bySig,
    tons,
    isComparison: sigs.length > 1,
    referenceSystem: reference?.[0] ?? null,
    referenceCostUf: reference?.[1].costUf ?? 0,
    referenceByMaterial: reference?.[1].byMaterial ?? new Map(),
  };
}

/**
 * Obtiene todas las filas de costo: piezas × ventas × SIG ACTIVO de la
 * organización (acuerdo 11-jul: la tarifa es la del sistema que la empresa
 * declara usar para ese producto prioritario).
 *
 * Resolución de tarifa, en orden:
 *   1. Mapeo manual de la organización (tariff_mappings) contra su SIG activo.
 *   2. Tarifa única: si el SIG activo tiene UNA sola categoría (NEUVOL,
 *      VALORA+), se aplica directamente sin mapeo.
 *   3. Sin tarifa → la fila aporta toneladas con costo 0 ("pendiente de
 *      homologación").
 *
 * Tarifas CLP/kg se convierten a UF/ton con el valor UF vigente (uf_values).
 * orgDbId null → vista global (desarrollo pre-multi-tenancy).
 */
async function getCostRows(
  orgDbId: string | null,
  filters: {
    year?: number;
    /** Mes puntual (1-12); 0 = registros anuales */
    month?: number;
    /** Acumulado: incluye los meses 1..monthUpTo */
    monthUpTo?: number;
    brand?: string;
    category?: string;
    materialClass?: string;
    systemName?: string;
    isDomiciliary?: boolean;
    productType?: string;
  }
): Promise<CostRow[]> {
  // Valor UF vigente para convertir tarifas CLP → UF
  const [latestUf] = await db
    .select()
    .from(ufValues)
    .orderBy(desc(ufValues.date))
    .limit(1);
  const ufClp = Number(latestUf?.valueClp ?? 0);

  // Tarifa única por sistema: SIG con exactamente 1 categoría de tarifa
  const allSystems = await db.query.managementSystems.findMany({
    with: { tariffCategories: { with: { tariffs: true } } },
  });
  const uniqueTariffBySystem = new Map<
    string,
    Map<number, { rateUfPerTon: number; rateValue: number; rateUnit: string }>
  >();
  for (const s of allSystems) {
    if (s.tariffCategories.length !== 1) continue;
    const byYear = new Map<number, { rateUfPerTon: number; rateValue: number; rateUnit: string }>();
    for (const t of s.tariffCategories[0].tariffs) {
      byYear.set(t.year, {
        rateUfPerTon: Number(t.rateUfPerTon),
        rateValue: Number(t.rateValue ?? t.rateUfPerTon),
        rateUnit: t.rateUnit,
      });
    }
    uniqueTariffBySystem.set(s.id, byYear);
  }

  // JOIN: piezas → producto → ventas → SIG activo (+ mapeo → tarifa)
  const rows = await db
    .select({
      productId: products.id,
      sku: products.sku,
      productName: products.name,
      brand: products.brand,
      category: products.category,
      productType: products.productType,
      customData: products.customData,
      pieceName: productPieces.pieceName,
      materialClass: productPieces.materialClass,
      materialDetail: productPieces.materialDetail,
      isDomiciliary: productPieces.isDomiciliary,
      weightGrams: productPieces.weightGrams,
      weightUnit: productPieces.weightUnit,
      salesYear: salesRecords.year,
      salesMonth: salesRecords.month,
      unitsSold: salesRecords.unitsSold,
      activeSystemId: organizationPriorityProducts.activeSystemId,
      systemId: managementSystems.id,
      systemName: managementSystems.name,
      mappedRateUfPerTon: tariffs.rateUfPerTon,
      mappedRateValue: tariffs.rateValue,
      mappedRateUnit: tariffs.rateUnit,
    })
    .from(productPieces)
    .innerJoin(
      products,
      and(
        eq(productPieces.productId, products.id),
        orgDbId ? eq(products.organizationId, orgDbId) : undefined
      )
    )
    // Las ventas se cruzan por segmento: en un mismo mes el detalle y el
    // transporte traen cifras distintas (172.066 botellas vs 8.000 pallets).
    // Sin esta condición las unidades del detalle se aplicaban también a los
    // pallets e inflaban el tonelaje NO DOMICILIARIO ~150 veces.
    .innerJoin(
      salesRecords,
      and(
        eq(products.id, salesRecords.productId),
        eq(
          salesRecords.segment,
          sql`CASE WHEN ${productPieces.isDomiciliary} THEN 'Domiciliario' ELSE 'No Domiciliario' END`
        )
      )
    )
    .leftJoin(
      organizationPriorityProducts,
      and(
        eq(organizationPriorityProducts.organizationId, products.organizationId),
        eq(
          organizationPriorityProducts.priorityProductId,
          products.priorityProductId
        )
      )
    )
    // Modo fijo: solo el SIG que la organización declara.
    // Modo libre (active_system_id NULL, o sin fila en
    // organization_priority_products): todos los SIG del producto prioritario,
    // para poder comparar cuánto costaría en cada uno.
    .leftJoin(
      managementSystems,
      and(
        eq(managementSystems.priorityProductId, products.priorityProductId),
        eq(managementSystems.isActive, true),
        or(
          isNull(organizationPriorityProducts.activeSystemId),
          eq(managementSystems.id, organizationPriorityProducts.activeSystemId)
        )
      )
    )
    .leftJoin(
      tariffMappings,
      and(
        eq(tariffMappings.organizationId, products.organizationId),
        // Por el SIG de esta fila, no por el activo: en modo libre hay una
        // fila por SIG y cada una necesita su propio mapeo.
        eq(tariffMappings.systemId, managementSystems.id),
        eq(tariffMappings.materialDetail, productPieces.materialDetail),
        eq(
          tariffMappings.segment,
          sql`CASE WHEN ${productPieces.isDomiciliary} THEN 'Domiciliario' ELSE 'No Domiciliario' END`
        ),
        eq(tariffMappings.hasGrease, productPieces.hasGrease),
        eq(tariffMappings.isHazardous, productPieces.isHazardous)
      )
    )
    .leftJoin(
      tariffCategories,
      eq(tariffMappings.tariffCategoryId, tariffCategories.id)
    )
    .leftJoin(
      tariffs,
      and(
        eq(tariffs.categoryId, tariffCategories.id),
        eq(tariffs.year, salesRecords.year)
      )
    );

  // Filtros en memoria (las filas no son masivas en este dominio)
  const filteredRows = rows.filter((r) => {
    if (filters.year && r.salesYear !== filters.year) return false;
    // month: un mes puntual. monthUpTo: acumulado a la fecha (1..N)
    if (filters.month !== undefined && r.salesMonth !== filters.month)
      return false;
    if (filters.monthUpTo !== undefined && r.salesMonth > filters.monthUpTo)
      return false;
    if (filters.brand && r.brand !== filters.brand) return false;
    if (filters.category && r.category !== filters.category) return false;
    if (filters.materialClass && r.materialClass !== filters.materialClass) return false;
    if (filters.systemName && (r.systemName ?? "Sin SIG") !== filters.systemName) return false;
    if (filters.isDomiciliary !== undefined && r.isDomiciliary !== filters.isDomiciliary) return false;
    if (filters.productType && r.productType !== filters.productType) return false;
    return true;
  });

  return filteredRows.map((r) => {
    // 1. mapeo manual → 2. tarifa única del SIG activo → 3. sin tarifa
    let rateValue = Number(r.mappedRateValue ?? r.mappedRateUfPerTon ?? 0);
    let rateUnit = r.mappedRateUnit ?? "UF/ton";
    // Fallback por el SIG de la fila (en modo libre hay una por SIG)
    if (!rateValue && r.systemId) {
      const unique = uniqueTariffBySystem.get(r.systemId)?.get(r.salesYear);
      if (unique) {
        rateValue = unique.rateValue;
        rateUnit = unique.rateUnit;
      }
    }
    // Tarifa efectiva en UF/ton (CLP/kg × 1000 kg/ton ÷ valor UF)
    const rateUfPerTon =
      rateUnit === "CLP/kg"
        ? ufClp > 0
          ? (rateValue * 1000) / ufClp
          : 0
        : rateValue;

    return {
      productId: r.productId,
      sku: r.sku,
      productName: r.productName,
      brand: r.brand,
      category: r.category,
      productType: r.productType,
      customData: r.customData,
      pieceName: r.pieceName,
      materialClass: r.materialClass,
      materialDetail: r.materialDetail,
      isDomiciliary: r.isDomiciliary,
      weightGrams: Number(r.weightGrams),
      weightUnit: r.weightUnit,
      salesYear: r.salesYear,
      salesMonth: r.salesMonth,
      unitsSold: r.unitsSold,
      systemName: r.systemName ?? "Sin SIG",
      rateUfPerTon,
    };
  });
}

// ── Filtros compartidos ──────────────────────────────────────────
const costFilters = z.object({
  year: z.number().int().optional(),
  /**
   * Las empresas declaran mensualmente y con desfase (1 o 2 meses según sea
   * DOM o NO DOM), así que hace falta ver un mes puntual o el acumulado.
   */
  month: z.number().int().min(0).max(12).optional(),
  monthUpTo: z.number().int().min(1).max(12).optional(),
  brand: z.string().optional(),
  category: z.string().optional(),
  materialClass: z.string().optional(),
  systemName: z.string().optional(),
  isDomiciliary: z.boolean().optional(),
  productType: z.string().optional(),
});

// ── Router ───────────────────────────────────────────────────────

export const costsRouter = createTRPCRouter({
  /**
   * summary — 6 KPIs del prototipo P1
   * Toneladas totales, costo por SIG, material mayor costo, etc.
   */
  summary: orgProcedure
    .input(costFilters.optional())
    .query(async ({ ctx, input }) => {
      const filters = input ?? {};
      const rows = await getCostRows(ctx.orgDbId, filters);

      const agg = aggregateBySig(rows);

      // Material de mayor costo, del SIG de referencia (no la suma de todos)
      let topMaterial = "—";
      let topMaterialCost = 0;
      for (const [name, data] of agg.referenceByMaterial) {
        if (data.costUf > topMaterialCost) {
          topMaterial = name;
          topMaterialCost = data.costUf;
        }
      }

      const costBySig = Array.from(agg.bySig.entries())
        .map(([name, data]) => ({
          systemName: name,
          tons: Math.round(data.tons * 100) / 100,
          costUf: Math.round(data.costUf * 100) / 100,
        }))
        .sort((a, b) => a.costUf - b.costUf);

      const conCosto = costBySig.filter((s) => s.costUf > 0);

      return {
        totalTons: Math.round(agg.tons * 100) / 100,
        /** Costo del SIG de referencia; nunca la suma entre sistemas */
        totalCostUf: Math.round(agg.referenceCostUf * 100) / 100,
        /** true cuando hay más de un SIG en juego: el total es comparativo */
        isComparison: agg.isComparison,
        /** SIG al que corresponde totalCostUf */
        referenceSystem: agg.referenceSystem,
        /** Rango entre SIG con tarifa, para rotular la comparación */
        costRange:
          conCosto.length > 1
            ? {
                min: conCosto[0].costUf,
                minSystem: conCosto[0].systemName,
                max: conCosto[conCosto.length - 1].costUf,
                maxSystem: conCosto[conCosto.length - 1].systemName,
              }
            : null,
        topMaterial,
        topMaterialCost: Math.round(topMaterialCost * 100) / 100,
        skuCount: new Set(rows.map((r) => r.sku)).size,
        costBySig,
      };
    }),

  /**
   * byMaterial — Tabla P2: Costo por Material
   * Retorna: material, toneladas, costo por cada SIG, % del total
   */
  byMaterial: orgProcedure
    .input(costFilters.optional())
    .query(async ({ ctx, input }) => {
      const filters = input ?? {};
      const rows = await getCostRows(ctx.orgDbId, filters);

      // material → { system → {tons, costUf} }
      const map = new Map<
        string,
        Map<string, { tons: number; costUf: number }>
      >();

      for (const row of rows) {
        const { tons, costUf } = calcCost(row);

        if (!map.has(row.materialClass)) map.set(row.materialClass, new Map());
        const matSystems = map.get(row.materialClass)!;

        const sig = matSystems.get(row.systemName) ?? { tons: 0, costUf: 0 };
        sig.tons += tons;
        sig.costUf += costUf;
        matSystems.set(row.systemName, sig);
      }

      // Listar todos los SIGs presentes
      const allSystems = [...new Set(rows.map((r) => r.systemName))].sort();

      // El % se mide contra el SIG de referencia, no contra la suma de todos
      const agg = aggregateBySig(rows);
      const referenceTotal = agg.referenceCostUf;

      const result = Array.from(map.entries()).map(([material, systems]) => {
        const costsBySig: Record<string, number> = {};
        for (const sig of allSystems) {
          costsBySig[sig] = Math.round((systems.get(sig)?.costUf ?? 0) * 100) / 100;
        }

        // Tonelaje del material: el mismo en cada SIG, así que se toma el mayor
        // en vez de sumar (sumar lo multiplicaba por la cantidad de SIG)
        const tons = Math.max(
          0,
          ...[...systems.values()].map((s) => s.tons)
        );

        const referenceCost = agg.referenceSystem
          ? (systems.get(agg.referenceSystem)?.costUf ?? 0)
          : 0;
        const pctTotal =
          referenceTotal > 0
            ? Math.round((referenceCost / referenceTotal) * 1000) / 10
            : 0;

        return {
          material,
          tons: Math.round(tons * 100) / 100,
          costsBySig,
          pctTotal,
        };
      });

      return {
        data: result.sort((a, b) => b.tons - a.tons),
        systems: allSystems,
        /** SIG usado para el % (null si no hay ninguno con tarifa) */
        referenceSystem: agg.referenceSystem,
      };
    }),

  /**
   * byBrand — Tabla P2: Costo por Marca
   */
  byBrand: orgProcedure
    .input(costFilters.optional())
    .query(async ({ ctx, input }) => {
      const filters = input ?? {};
      const rows = await getCostRows(ctx.orgDbId, filters);

      // Obtener todos los SIGs
      const allSystems = [...new Set(rows.map((r) => r.systemName))].sort();

      // marca → { skus, tons, costPorSig }
      const map = new Map<
        string,
        { skus: Set<string>; tons: number; costsBySig: Record<string, number> }
      >();

      for (const row of rows) {
        const brand = row.brand || "Sin Marca";
        const { tons, costUf } = calcCost(row);

        if (!map.has(brand)) {
          map.set(brand, {
            skus: new Set(),
            tons: 0,
            costsBySig: Object.fromEntries(allSystems.map((s) => [s, 0])),
          });
        }
        const entry = map.get(brand)!;
        entry.skus.add(row.sku);
        entry.tons += tons;
        entry.costsBySig[row.systemName] =
          (entry.costsBySig[row.systemName] ?? 0) + costUf;
      }

      const result = Array.from(map.entries()).map(([brand, data]) => ({
        brand,
        skuCount: data.skus.size,
        tons: Math.round(data.tons * 100) / 100,
        costsBySig: Object.fromEntries(
          Object.entries(data.costsBySig).map(([k, v]) => [
            k,
            Math.round(v * 100) / 100,
          ])
        ),
      }));

      return {
        data: result.sort((a, b) => b.tons - a.tons),
        systems: allSystems,
      };
    }),

  /**
   * topSkus — Top N SKUs más costosos (P2 + P5)
   */
  topSkus: orgProcedure
    .input(
      costFilters
        .extend({
          limit: z.number().int().min(1).max(50).default(10),
          targetSystem: z.string().optional(),
          /**
           * Ordenar por costo total o por costo unitario (UF/ton).
           *
           * Por total siempre ganan los SKU de mayor volumen, que es
           * información pobre para priorizar ecodiseño: dice cuánto pesan en la
           * factura, no cuán ineficiente es su envase. El factor UF/ton
           * normaliza y hace comparables SKU de volúmenes muy distintos.
           */
          sortBy: z.enum(["costTotal", "costPerTon"]).default("costTotal"),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const {
        limit = 10,
        targetSystem,
        sortBy = "costTotal",
        ...filters
      } = input ?? {};
      const rows = await getCostRows(ctx.orgDbId, filters);

      // Filtrar a un solo SIG si se especifica
      const filtered = targetSystem
        ? rows.filter((r) => r.systemName === targetSystem)
        : rows;

      // Agrupar por SKU
      const skuMap = new Map<
        string,
        {
          sku: string;
          productName: string;
          brand: string | null;
          materialClass: string;
          tons: number;
          costUf: number;
        }
      >();

      for (const row of filtered) {
        const { tons, costUf } = calcCost(row);
        const existing = skuMap.get(row.sku);
        if (existing) {
          existing.tons += tons;
          existing.costUf += costUf;
        } else {
          skuMap.set(row.sku, {
            sku: row.sku,
            productName: row.productName,
            brand: row.brand,
            materialClass: row.materialClass,
            tons,
            costUf,
          });
        }
      }

      const conFactor = Array.from(skuMap.values()).map((s) => ({
        ...s,
        tons: Math.round(s.tons * 100) / 100,
        costUf: Math.round(s.costUf * 100) / 100,
        /**
         * Factor de costo: UF por tonelada declarada. Es la tarifa promedio
         * ponderada del envase, independiente del volumen vendido.
         */
        costPerTon: s.tons > 0 ? Math.round((s.costUf / s.tons) * 100) / 100 : 0,
      }));

      const ranked = conFactor
        .sort((a, b) =>
          sortBy === "costPerTon"
            ? b.costPerTon - a.costPerTon
            : b.costUf - a.costUf
        )
        .slice(0, limit);

      return ranked;
    }),

  /**
   * simulate — Simulador P4
   * Recalcula costo con peso/material/volumen modificados
   */
  simulate: orgProcedure
    .input(
      z.object({
        sku: z.string(),
        year: z.number().int(),
        newWeightGrams: z.number().positive().optional(),
        newMaterialDetail: z.string().optional(),
        newUnitsSold: z.number().int().positive().optional(),
        /**
         * Pieza a modificar. Sin esto el peso y la materialidad se aplicaban a
         * TODAS las piezas del SKU, lo que invertía la mezcla de materiales:
         * bajar el gramaje "general" encogía la pieza barata y engordaba las
         * caras, y el costo subía aunque el tonelaje bajara.
         */
        pieceName: z.string().optional(),
        materialDetail: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Obtener datos actuales del SKU
      const rows = await getCostRows(ctx.orgDbId, { year: input.year });
      const skuRows = rows.filter((r) => r.sku === input.sku);

      if (skuRows.length === 0) {
        return { error: "SKU no encontrado o sin datos para ese año" };
      }

      // Cambio de materialidad: re-mapear la tarifa del material nuevo
      // contra el SIG activo. Mismo fallback que getCostRows:
      //   1. Mapeo manual → 2. Tarifa única del SIG → 3. sin tarifa (0)
      const newRateBySegment = new Map<string, number>();
      if (input.newMaterialDetail) {
        const prod = await db.query.products.findFirst({
          where: (p, { eq: _eq, and: _and }) =>
            _and(
              _eq(p.sku, input.sku),
              ctx.orgDbId ? _eq(p.organizationId, ctx.orgDbId) : undefined
            ),
        });
        const link = prod?.priorityProductId
          ? await db.query.organizationPriorityProducts.findFirst({
              where: (l, { eq: _eq, and: _and }) =>
                _and(
                  _eq(l.organizationId, prod.organizationId),
                  _eq(l.priorityProductId, prod.priorityProductId!)
                ),
            })
          : null;
        if (link?.activeSystemId) {
          const [latestUf] = await db
            .select()
            .from(ufValues)
            .orderBy(desc(ufValues.date))
            .limit(1);
          const ufClp = Number(latestUf?.valueClp ?? 0);

          // Fallback: SIG con tarifa única (1 sola categoría)
          const activeSystem = await db.query.managementSystems.findFirst({
            where: (s, { eq: _eq }) => _eq(s.id, link.activeSystemId!),
            with: { tariffCategories: { with: { tariffs: true } } },
          });
          const isUniqueTariff = activeSystem?.tariffCategories.length === 1;
          const uniqueTariff = isUniqueTariff
            ? activeSystem!.tariffCategories[0].tariffs.find(
                (t) => t.year === input.year
              )
            : null;

          for (const segment of ["Domiciliario", "No Domiciliario"]) {
            // 1. Mapeo manual
            const mapping = await db.query.tariffMappings.findFirst({
              where: (tm, { eq: _eq, and: _and }) =>
                _and(
                  _eq(tm.organizationId, prod!.organizationId),
                  _eq(tm.systemId, link.activeSystemId!),
                  _eq(tm.materialDetail, input.newMaterialDetail!),
                  _eq(tm.segment, segment),
                  _eq(tm.hasGrease, false),
                  _eq(tm.isHazardous, false)
                ),
            });
            let rateValue = 0;
            let rateUnit = "UF/ton";
            if (mapping) {
              const tariff = await db.query.tariffs.findFirst({
                where: (t, { eq: _eq, and: _and }) =>
                  _and(
                    _eq(t.categoryId, mapping.tariffCategoryId),
                    _eq(t.year, input.year)
                  ),
              });
              if (tariff) {
                rateValue = Number(tariff.rateValue ?? tariff.rateUfPerTon);
                rateUnit = tariff.rateUnit;
              }
            } else if (uniqueTariff) {
              // 2. Tarifa única del SIG (NEUVOL, VALORA+, etc.)
              rateValue = Number(uniqueTariff.rateValue ?? uniqueTariff.rateUfPerTon);
              rateUnit = uniqueTariff.rateUnit;
            }
            if (rateValue > 0) {
              newRateBySegment.set(
                segment,
                rateUnit === "CLP/kg"
                  ? ufClp > 0
                    ? (rateValue * 1000) / ufClp
                    : 0
                  : rateValue
              );
            }
          }
        }
      }

      // Escenario actual
      const currentBySig = new Map<string, { tons: number; costUf: number }>();
      for (const row of skuRows) {
        const { tons, costUf } = calcCost(row);
        const sig = currentBySig.get(row.systemName) ?? { tons: 0, costUf: 0 };
        sig.tons += tons;
        sig.costUf += costUf;
        currentBySig.set(row.systemName, sig);
      }

      // Escenario simulado (peso, volumen y/o materialidad)
      //
      // El peso y la materialidad afectan SOLO a la pieza elegida; el volumen
      // es del SKU completo, así que aplica a todas las filas.
      const targetsPiece = (row: (typeof skuRows)[number]) =>
        (!input.pieceName || row.pieceName === input.pieceName) &&
        (!input.materialDetail || row.materialDetail === input.materialDetail);

      const simBySig = new Map<string, { tons: number; costUf: number }>();
      for (const row of skuRows) {
        const segment = row.isDomiciliary ? "Domiciliario" : "No Domiciliario";
        const isTarget = targetsPiece(row);
        const simRow = {
          ...row,
          weightGrams: isTarget
            ? (input.newWeightGrams ?? row.weightGrams)
            : row.weightGrams,
          unitsSold: input.newUnitsSold ?? row.unitsSold,
          rateUfPerTon:
            isTarget && input.newMaterialDetail
              ? (newRateBySegment.get(segment) ?? 0)
              : row.rateUfPerTon,
        };
        const { tons, costUf } = calcCost(simRow);

        const sig = simBySig.get(row.systemName) ?? { tons: 0, costUf: 0 };
        sig.tons += tons;
        sig.costUf += costUf;
        simBySig.set(row.systemName, sig);
      }

      // Construir resultado comparativo
      const results = Array.from(currentBySig.entries()).map(
        ([systemName, current]) => {
          const sim = simBySig.get(systemName) ?? { tons: 0, costUf: 0 };
          return {
            systemName,
            current: {
              tons: Math.round(current.tons * 100) / 100,
              costUf: Math.round(current.costUf * 100) / 100,
            },
            simulated: {
              tons: Math.round(sim.tons * 100) / 100,
              costUf: Math.round(sim.costUf * 100) / 100,
            },
            diff: {
              tons: Math.round((sim.tons - current.tons) * 100) / 100,
              costUf: Math.round((sim.costUf - current.costUf) * 100) / 100,
              pctChange:
                current.costUf > 0
                  ? Math.round(
                      ((sim.costUf - current.costUf) / current.costUf) * 1000
                    ) / 10
                  : 0,
            },
          };
        }
      );

      /**
       * Piezas del SKU, deduplicadas: skuRows trae una fila por pieza × período
       * × SIG. Alimenta el selector de pieza del simulador y evita mostrar
       * "Material: PET" cuando el envase tiene 4 materiales distintos.
       */
      const pieces = Array.from(
        skuRows
          .reduce(
            (acc, r) => {
              const key = `${r.pieceName}|${r.materialDetail}|${r.isDomiciliary}`;
              if (!acc.has(key)) {
                acc.set(key, {
                  pieceName: r.pieceName,
                  materialClass: r.materialClass,
                  materialDetail: r.materialDetail,
                  isDomiciliary: r.isDomiciliary,
                  weightGrams: r.weightGrams,
                });
              }
              return acc;
            },
            new Map<
              string,
              {
                pieceName: string;
                materialClass: string;
                materialDetail: string;
                isDomiciliary: boolean;
                weightGrams: number;
              }
            >()
          )
          .values()
      ).sort((a, b) => b.weightGrams - a.weightGrams);

      /** Pieza sobre la que se está simulando (null = todas) */
      const target =
        pieces.find(
          (p) =>
            (!input.pieceName || p.pieceName === input.pieceName) &&
            (!input.materialDetail || p.materialDetail === input.materialDetail)
        ) ?? null;

      const totalWeight = pieces.reduce((a, p) => a + p.weightGrams, 0);

      return {
        sku: input.sku,
        productName: skuRows[0].productName,
        /** Todas las piezas, para elegir cuál simular */
        pieces,
        /** Peso de una unidad completa del producto, sumando sus piezas */
        totalWeightGrams: Math.round(totalWeight * 100) / 100,
        inputs: {
          /** Peso de la pieza simulada, no de una pieza al azar */
          currentWeight: target?.weightGrams ?? totalWeight,
          newWeight: input.newWeightGrams ?? target?.weightGrams ?? totalWeight,
          currentUnits: skuRows[0].unitsSold,
          newUnits: input.newUnitsSold ?? skuRows[0].unitsSold,
          currentMaterial: target?.materialDetail ?? "varios",
          newMaterial:
            input.newMaterialDetail ?? target?.materialDetail ?? "varios",
          pieceName: target?.pieceName ?? null,
        },
        results,
      };
    }),

  /**
   * monthlyEvolution — Toneladas y costo mes a mes, con acumulado.
   *
   * Las empresas declaran mensualmente y con desfase, así que el reporte que
   * piden es "cuánto llevo declarado y cuánto llevo pagando a la fecha".
   * Devuelve una serie por SIG para poder graficar la comparación.
   */
  monthlyEvolution: orgProcedure
    .input(costFilters.optional())
    .query(async ({ ctx, input }) => {
      const filters = input ?? {};
      // El mes lo pone la serie, no el filtro
      const rows = await getCostRows(ctx.orgDbId, {
        ...filters,
        month: undefined,
        monthUpTo: undefined,
      });

      // sig → mes → acumulador
      const bySig = new Map<string, Map<number, { tons: number; costUf: number }>>();
      for (const row of rows) {
        if (!bySig.has(row.systemName)) bySig.set(row.systemName, new Map());
        const months = bySig.get(row.systemName)!;
        const acc = months.get(row.salesMonth) ?? { tons: 0, costUf: 0 };
        const { tons, costUf } = calcCost(row);
        acc.tons += tons;
        acc.costUf += costUf;
        months.set(row.salesMonth, acc);
      }

      const monthsPresent = [
        ...new Set(rows.map((r) => r.salesMonth)),
      ].sort((a, b) => a - b);

      const series = [...bySig.entries()]
        .map(([systemName, months]) => {
          let accTons = 0;
          let accCostUf = 0;
          const points = monthsPresent.map((month) => {
            const d = months.get(month) ?? { tons: 0, costUf: 0 };
            accTons += d.tons;
            accCostUf += d.costUf;
            return {
              month,
              tons: Math.round(d.tons * 100) / 100,
              costUf: Math.round(d.costUf * 100) / 100,
              accTons: Math.round(accTons * 100) / 100,
              accCostUf: Math.round(accCostUf * 100) / 100,
            };
          });
          return {
            systemName,
            points,
            totalTons: Math.round(accTons * 100) / 100,
            totalCostUf: Math.round(accCostUf * 100) / 100,
          };
        })
        .sort((a, b) => a.totalCostUf - b.totalCostUf);

      return { months: monthsPresent, series };
    }),

  /**
   * availableFilters — Valores para los dropdowns, acotados a la organización
   * y al producto prioritario activo (años, marcas, categorías, materiales y
   * SIG solo del producto en contexto).
   */
  availableFilters: orgProcedure
    .input(z.object({ productType: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const productType = input?.productType;
      const baseFilter = and(
        ctx.orgDbId ? eq(products.organizationId, ctx.orgDbId) : undefined,
        productType
          ? eq(
              products.productType,
              productType as (typeof productTypeEnum.enumValues)[number]
            )
          : undefined
      );
      // enum legacy → código del catálogo de productos prioritarios
      const ppCode = productType
        ? ({ pilas: "pilas_aee" } as Record<string, string>)[productType] ??
          productType
        : null;

      const [yearsRaw, brandsRaw, categoriesRaw, materialsRaw, systemsRaw] =
        await Promise.all([
          db
            .selectDistinct({ year: salesRecords.year })
            .from(salesRecords)
            .innerJoin(products, eq(salesRecords.productId, products.id))
            .where(baseFilter)
            .orderBy(asc(salesRecords.year)),
          db
            .selectDistinct({ brand: products.brand })
            .from(products)
            .where(and(baseFilter, sql`${products.brand} IS NOT NULL`))
            .orderBy(asc(products.brand)),
          db
            .selectDistinct({ category: products.category })
            .from(products)
            .where(and(baseFilter, sql`${products.category} IS NOT NULL`))
            .orderBy(asc(products.category)),
          db
            .selectDistinct({ materialClass: productPieces.materialClass })
            .from(productPieces)
            .innerJoin(products, eq(productPieces.productId, products.id))
            .where(baseFilter)
            .orderBy(asc(productPieces.materialClass)),
          db
            .select({ name: managementSystems.name })
            .from(managementSystems)
            .leftJoin(
              priorityProducts,
              eq(managementSystems.priorityProductId, priorityProducts.id)
            )
            .where(
              and(
                eq(managementSystems.isActive, true),
                ppCode
                  ? sql`(${priorityProducts.code} = ${ppCode} OR ${managementSystems.priorityProductId} IS NULL)`
                  : undefined
              )
            )
            .orderBy(asc(managementSystems.name)),
        ]);

      // Meses con datos declarados (0 = registros anuales)
      const monthsRaw = await db
        .selectDistinct({ month: salesRecords.month })
        .from(salesRecords)
        .innerJoin(products, eq(salesRecords.productId, products.id))
        .where(baseFilter)
        .orderBy(asc(salesRecords.month));

      return {
        years: yearsRaw.map((y) => y.year),
        months: monthsRaw.map((m) => m.month).filter((m) => m > 0),
        brands: brandsRaw.map((b) => b.brand).filter(Boolean) as string[],
        categories: categoriesRaw
          .map((c) => c.category)
          .filter(Boolean) as string[],
        materials: materialsRaw.map((m) => m.materialClass),
        systems: systemsRaw.map((s) => s.name),
      };
    }),
});

