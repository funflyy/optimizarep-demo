/**
 * Parseo de la Línea Base de Productos desde Excel.
 *
 * Estructura del archivo: una fila por (SKU, período, pieza). Un mismo SKU
 * puede repetirse en varios meses, y el total de `Ventas` viene repetido en
 * cada fila del período — NO es una venta por pieza.
 *
 * Vive fuera del componente para poder testearlo.
 */
import { parseDecimal } from "@/lib/number";
import {
  indexRow,
  modeOrMax,
  parseBool,
  parseMonth,
  pick,
  pickText,
} from "@/lib/excel-columns";

export interface ParsedPiece {
  pieceName: string;
  packagingType: "primary" | "secondary" | "tertiary";
  isDomiciliary: boolean;
  materialClass: string;
  wasteType: "recyclable" | "non_recyclable";
  materialDetail: string;
  weightGrams: number;
  hasGrease: boolean;
  isHazardous: boolean;
}

export interface ParsedSale {
  year: number;
  month: number;
  /**
   * Segmento al que aplican estas unidades.
   *
   * En un mismo mes un SKU trae dos cifras: las unidades de venta al detalle
   * y los pallets o cajas que las transportan. Antes se guardaba una sola por
   * mes (la del detalle) y se aplicaba a todas las piezas, lo que inflaba el
   * tonelaje no domiciliario ~150 veces.
   */
  segment: "Domiciliario" | "No Domiciliario";
  unitsSold: number;
}

export interface ParsedProduct {
  sku: string;
  name: string;
  brand: string;
  category: string;
  pieces: ParsedPiece[];
  sales: ParsedSale[];
  /** Bloquean la importación de este SKU */
  errors: string[];
  /** No bloquean: se importa, pero conviene revisar */
  warnings: string[];
}

/** Ventas de un período y segmento, antes de resolver el valor definitivo */
interface PeriodTally {
  year: number;
  month: number;
  segment: "Domiciliario" | "No Domiciliario";
  units: number[];
}

const DEFAULT_YEAR = 2025;

/** ¿Se puede enviar este producto a la BD? */
export function isImportable(p: ParsedProduct): boolean {
  return p.errors.length === 0 && p.pieces.length > 0;
}

/** Agrupa las filas del Excel en productos con piezas y ventas por período. */
export function parseProductsSheet(
  rawRows: Record<string, unknown>[]
): ParsedProduct[] {
  const productMap = new Map<string, ParsedProduct>();
  /** SKU → firmas de pieza ya vistas (deduplica piezas repetidas entre meses) */
  const pieceKeys = new Map<string, Set<string>>();
  /** SKU → "año-mes" → ventas observadas */
  const periods = new Map<string, Map<string, PeriodTally>>();
  const duplicateRows = new Map<string, number>();

  for (const raw of rawRows) {
    const row = indexRow(raw);
    const sku = pickText(row, "SKU", "Código", "Codigo");
    if (!sku) continue;

    if (!productMap.has(sku)) {
      productMap.set(sku, {
        sku,
        name: pickText(row, "Producto", "Nombre", "Descripción", "Descripcion"),
        brand: pickText(row, "Marca"),
        // "Categoría REP" es DOM / NO DOM (segmento), no la categoría comercial
        category: pickText(row, "Departamento", "Categoría", "Categoria"),
        pieces: [],
        sales: [],
        errors: [],
        warnings: [],
      });
      pieceKeys.set(sku, new Set());
      periods.set(sku, new Map());
    }
    const prod = productMap.get(sku)!;

    // ── Pieza ────────────────────────────────────────────────────
    const pieceName = pickText(row, "Pieza", "Componente") || "Envase";
    const weight = parseDecimal(
      pick(row, "Peso (g)", "Peso(g)", "Peso g", "Peso")
    );

    const packagingRaw = pickText(
      row,
      "Tipo de Envase",
      "TipoEnvase"
    ).toLowerCase();
    const packagingType = packagingRaw.includes("secund")
      ? "secondary"
      : packagingRaw.includes("terci")
        ? "tertiary"
        : "primary";

    // "Categoría REP" = DOM / NO DOM. Ojo: "NO DOM" contiene "DOM", así que
    // hay que descartar el prefijo negativo antes de comparar.
    const segmentRaw = pickText(
      row,
      "Categoría REP",
      "Categoria REP",
      "Segmento"
    );
    const isDomiciliary = resolveDomiciliary(
      segmentRaw,
      pick(row, "Domiciliario")
    );

    // El schema documenta materialClass como "Plástico, Metal, Celulosa..." y
    // materialDetail como "PET, HDPE, Cartón...". En el archivo eso corresponde
    // a "Subcategoría REP" y "Material" respectivamente.
    const materialClass =
      pickText(
        row,
        "Subcategoría REP",
        "Subcategoria REP",
        "Clase de Material"
      ) ||
      pickText(row, "Material") ||
      "Otros";
    const materialDetail =
      pickText(row, "Material", "Detalle Material", "DetalleMaterial") ||
      "Otros";

    const wasteRaw = pickText(
      row,
      "Tipo de Residuo",
      "TipoResiduo"
    ).toLowerCase();
    // "Irreciclable" NO contiene "no": hay que detectarlo explícitamente.
    const wasteType =
      wasteRaw.startsWith("irreciclable") ||
      wasteRaw.includes("no reciclable") ||
      wasteRaw.includes("noreciclable")
        ? "non_recyclable"
        : "recyclable";

    // En este archivo la presencia de grasa viaja en "Detalle Material"
    // ("Sin Grasa" / "Con Grasa"), no en una columna "Grasa".
    const greaseRaw = pickText(row, "Grasa", "Detalle Material").toLowerCase();
    const hasGrease = greaseRaw.includes("con grasa") || greaseRaw === "grasa";

    const isHazardous = parseBool(pick(row, "Peligroso")) ?? false;

    if (weight > 0) {
      const key = [
        pieceName,
        packagingType,
        isDomiciliary,
        materialClass,
        wasteType,
        materialDetail,
        weight,
        hasGrease,
        isHazardous,
      ].join("|");
      if (pieceKeys.get(sku)!.has(key)) {
        duplicateRows.set(sku, (duplicateRows.get(sku) ?? 0) + 1);
      } else {
        pieceKeys.get(sku)!.add(key);
        prod.pieces.push({
          pieceName,
          packagingType,
          isDomiciliary,
          materialClass,
          wasteType,
          materialDetail,
          weightGrams: weight,
          hasGrease,
          isHazardous,
        });
      }
    } else {
      prod.warnings.push(`pieza "${pieceName}" omitida: sin peso válido`);
    }

    // ── Ventas del período ───────────────────────────────────────
    const year =
      Math.round(parseDecimal(pick(row, "Año", "AñoVentas", "Ano", "Year"))) ||
      DEFAULT_YEAR;
    const month = parseMonth(pick(row, "Mes", "Month"));
    const units = Math.round(parseDecimal(pick(row, "Ventas", "Unidades")));

    if (units > 0) {
      // Las unidades se agrupan por segmento: en un mismo mes el detalle y el
      // transporte traen cifras distintas y no son intercambiables.
      const segment: ParsedSale["segment"] = isDomiciliary
        ? "Domiciliario"
        : "No Domiciliario";
      const periodKey = `${year}-${month}-${segment}`;
      const byPeriod = periods.get(sku)!;
      if (!byPeriod.has(periodKey)) {
        byPeriod.set(periodKey, { year, month, segment, units: [] });
      }
      byPeriod.get(periodKey)!.units.push(units);
    }
  }

  // ── Resolver ventas y validar ──────────────────────────────────
  for (const prod of productMap.values()) {
    const byPeriod = periods.get(prod.sku)!;

    for (const tally of byPeriod.values()) {
      // Dentro de un mismo período y segmento la cifra se repite en cada fila
      // de pieza; la moda descarta un valor tipeado mal en una sola fila.
      const units = modeOrMax(tally.units);
      if (units === undefined) continue;

      const distinct = new Set(tally.units);
      if (distinct.size > 1) {
        prod.warnings.push(
          `${periodLabel(tally)} · ${tally.segment}: ventas inconsistentes (${[
            ...distinct,
          ]
            .map((v) => v.toLocaleString("es-CL"))
            .join(" / ")}), se usó ${units.toLocaleString("es-CL")}`
        );
      }

      prod.sales.push({
        year: tally.year,
        month: tally.month,
        segment: tally.segment,
        unitsSold: units,
      });
    }
    prod.sales.sort(
      (a, b) =>
        a.year - b.year ||
        a.month - b.month ||
        a.segment.localeCompare(b.segment)
    );

    const dup = duplicateRows.get(prod.sku);
    if (dup) prod.warnings.push(`${dup} fila(s) duplicada(s) ignorada(s)`);

    if (!prod.name) prod.errors.push("sin nombre de producto");
    if (prod.pieces.length === 0)
      prod.errors.push("ninguna pieza con peso válido");
  }

  return [...productMap.values()];
}

function resolveDomiciliary(segment: string, explicit: unknown): boolean {
  const fromColumn = parseBool(explicit);
  if (fromColumn !== undefined) return fromColumn;
  const s = segment.toLowerCase().replace(/[^a-z]/g, "");
  if (!s) return true; // sin dato: se asume domiciliario (comportamiento previo)
  if (s.startsWith("nodom")) return false;
  return true;
}

const MONTH_NAMES = [
  "anual", "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function periodLabel(t: { year: number; month: number }): string {
  return t.month === 0 ? String(t.year) : `${MONTH_NAMES[t.month]} ${t.year}`;
}
