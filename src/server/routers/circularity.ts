/**
 * circularity.ts — Índice de circularidad por SKU.
 *
 * La metodología vive en `@/server/circularity` (pura y testeada); acá solo se
 * arman los insumos: las piezas de cada SKU y la mediana de peso de sus envases
 * comparables.
 */
import { z } from "zod";
import { createTRPCRouter, orgProcedure } from "@/server/trpc";
import { productTypeEnum } from "@/server/db/schema";
import {
  scoreCircularity,
  levelOf,
  DIMENSION_WEIGHTS,
  type CircularityLevel,
  type CircularityPiece,
  type DimensionKey,
} from "@/server/circularity";

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Mínimo de envases comparables para que la mediana signifique algo */
const MIN_COHORT = 4;

const filters = z
  .object({ productType: z.string().optional() })
  .optional();

export const circularityRouter = createTRPCRouter({
  /**
   * Índice de cada SKU del catálogo, con el desglose por dimensión.
   *
   * La referencia de peso es la mediana de los envases de la misma familia (o
   * categoría, si no hay familia cargada). Con menos de 4 comparables se cae a
   * la mediana de todo el catálogo, y si tampoco alcanza, la dimensión "peso"
   * queda sin datos en vez de inventar una referencia.
   */
  byProduct: orgProcedure.input(filters).query(async ({ ctx, input }) => {
    const rows = await ctx.db.query.products.findMany({
      with: { pieces: true },
      where: (p, { and: _and, eq: _eq }) =>
        _and(
          ctx.orgDbId ? _eq(p.organizationId, ctx.orgDbId) : undefined,
          input?.productType
            ? _eq(
                p.productType,
                input.productType as (typeof productTypeEnum.enumValues)[number]
              )
            : undefined
        ),
    });

    const conPiezas = rows.filter((p) => p.pieces.length > 0);

    // Peso total del envase por SKU, y cohortes por familia
    // Mismo alcance que el índice: sin transporte. Si la mediana incluyera los
    // pallets, compararía el envase de un SKU contra el envase MÁS el pallet de
    // otro, y el SKU que declaró su pallet saldría castigado dos veces.
    const pesoDe = (p: (typeof conPiezas)[number]) =>
      p.pieces
        .filter((x) => x.packagingType !== "tertiary")
        .reduce((a, x) => a + x.weightGrams, 0);
    const cohorteDe = (p: (typeof conPiezas)[number]) =>
      (p.family || p.category || "").trim().toLowerCase();

    const porCohorte = new Map<string, number[]>();
    for (const p of conPiezas) {
      const k = cohorteDe(p);
      if (!k) continue;
      const arr = porCohorte.get(k);
      if (arr) arr.push(pesoDe(p));
      else porCohorte.set(k, [pesoDe(p)]);
    }
    const medianaCohorte = new Map<string, number>();
    for (const [k, pesos] of porCohorte) {
      if (pesos.length >= MIN_COHORT) medianaCohorte.set(k, median(pesos));
    }
    const medianaGlobal =
      conPiezas.length >= MIN_COHORT ? median(conPiezas.map(pesoDe)) : null;

    const items = conPiezas.map((p) => {
      const pieces: CircularityPiece[] = p.pieces.map((x) => ({
        pieceName: x.pieceName,
        materialDetail: x.materialDetail,
        weightGrams: x.weightGrams,
        packagingType: x.packagingType,
        wasteType: x.wasteType === "non_recyclable" ? "non_recyclable" : "recyclable",
        hasGrease: x.hasGrease,
        recycledPercentage:
          x.recycledPercentage === null || x.recycledPercentage === undefined
            ? null
            : Number(x.recycledPercentage),
      }));

      const cohorte = cohorteDe(p);
      const benchmark = medianaCohorte.get(cohorte) ?? medianaGlobal;
      const result = scoreCircularity({
        pieces,
        weightBenchmarkGrams: benchmark,
      });

      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        family: p.family || p.category || null,
        /** De dónde salió la referencia de peso, para poder discutirla */
        benchmarkSource: medianaCohorte.has(cohorte)
          ? `familia «${p.family || p.category}»`
          : medianaGlobal !== null
            ? "catálogo completo"
            : "sin referencia",
        ...result,
      };
    });

    items.sort((a, b) => a.score - b.score);

    // Promedios por dimensión, solo sobre los SKU donde se pudo evaluar
    const porDimension = (Object.keys(DIMENSION_WEIGHTS) as DimensionKey[]).map(
      (key) => {
        const vals = items
          .map((i) => i.dimensions.find((d) => d.key === key)?.score)
          .filter((v): v is number => v !== null && v !== undefined);
        return {
          key,
          label:
            items[0]?.dimensions.find((d) => d.key === key)?.label ?? key,
          weight: DIMENSION_WEIGHTS[key],
          evaluados: vals.length,
          promedio:
            vals.length > 0
              ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
              : null,
        };
      }
    );

    const niveles: Record<CircularityLevel, number> = {
      Excelente: 0,
      Bueno: 0,
      Mejorable: 0,
      Crítico: 0,
    };
    for (const i of items) niveles[i.level]++;

    const promedio =
      items.length > 0
        ? Math.round(
            (items.reduce((a, i) => a + i.score, 0) / items.length) * 10
          ) / 10
        : 0;

    return {
      items,
      /** SKU sin piezas declaradas: no se pueden evaluar */
      sinPiezas: rows.length - conPiezas.length,
      promedio,
      nivelPromedio: levelOf(promedio),
      niveles,
      porDimension,
    };
  }),

  /** Desglose de un SKU puntual */
  byId: orgProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const p = await ctx.db.query.products.findFirst({
        with: { pieces: true },
        where: (t, { and: _and, eq: _eq }) =>
          _and(
            _eq(t.id, input.id),
            ctx.orgDbId ? _eq(t.organizationId, ctx.orgDbId) : undefined
          ),
      });
      if (!p) return null;

      // Mediana de la misma familia, con el mismo criterio que byProduct
      const hermanos = await ctx.db.query.products.findMany({
        with: { pieces: true },
        where: (t, { and: _and, eq: _eq }) =>
          _and(ctx.orgDbId ? _eq(t.organizationId, ctx.orgDbId) : undefined),
      });
      const cohorte = (p.family || p.category || "").trim().toLowerCase();
      const pesos = hermanos
        .filter((h) => h.pieces.length > 0)
        .filter((h) => (h.family || h.category || "").trim().toLowerCase() === cohorte)
        .map((h) =>
          h.pieces
            .filter((x) => x.packagingType !== "tertiary")
            .reduce((a, x) => a + x.weightGrams, 0)
        );

      return {
        sku: p.sku,
        name: p.name,
        ...scoreCircularity({
          pieces: p.pieces.map((x) => ({
            pieceName: x.pieceName,
            materialDetail: x.materialDetail,
            weightGrams: x.weightGrams,
            packagingType: x.packagingType,
            wasteType:
              x.wasteType === "non_recyclable" ? "non_recyclable" : "recyclable",
            hasGrease: x.hasGrease,
            recycledPercentage:
              x.recycledPercentage === null || x.recycledPercentage === undefined
                ? null
                : Number(x.recycledPercentage),
          })),
          weightBenchmarkGrams: pesos.length >= MIN_COHORT ? median(pesos) : null,
        }),
      };
    }),
});
