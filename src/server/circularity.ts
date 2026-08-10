/**
 * Índice de circularidad — metodología propia de la plataforma.
 *
 * MB definió la escala (0-100) y el peso de cada dimensión; la forma de puntuar
 * cada una quedó abierta ("acá tendríamos que trabajar en la metodología").
 * Esta es la propuesta, con el criterio de cada dimensión explicitado para que
 * puedan discutirlo dimensión por dimensión en vez de aceptar o rechazar un
 * número opaco.
 *
 * Dos principios:
 *
 *   1. Cada dimensión se puntúa sobre algo observable en la línea base. Nada de
 *      constantes elegidas para que el resultado se vea bien.
 *
 *   2. Falta de dato NO es cero. Un envase sin material reciclado declarado no
 *      es un envase con 0% de reciclado: es un envase del que no se sabe. Esas
 *      dimensiones se marcan "sin datos" y su peso se reparte entre las demás,
 *      así el índice no castiga a la empresa por no haber cargado todavía una
 *      columna que recién se está pidiendo.
 *
 * ALCANCE: el índice mide el envase DEL PRODUCTO (primario y secundario) y deja
 * fuera el terciario, que es embalaje de transporte.
 *
 * No es una simplificación, es lo que hace que el número signifique algo. En la
 * línea base de MB solo 27 de 63 SKU declaran terciario, y todos con el mismo
 * peso de 100,0 g: un valor por defecto, no medido. Incluirlo hacía dos daños a
 * la vez — el 64% de la masa del catálogo quedaba apoyada en un placeholder, y
 * un SKU puntuaba PEOR por haber declarado su pallet, o sea por declarar mejor.
 * Un indicador que castiga declarar bien no sirve.
 */

export type CircularityLevel = "Excelente" | "Bueno" | "Mejorable" | "Crítico";

export interface CircularityPiece {
  pieceName: string;
  materialDetail: string;
  weightGrams: number;
  /** El terciario (transporte) no entra en el índice; ver ALCANCE arriba */
  packagingType: "primary" | "secondary" | "tertiary";
  wasteType: "recyclable" | "non_recyclable";
  hasGrease: boolean;
  /** null = no declarado, distinto de 0 = declarado sin reciclado */
  recycledPercentage: number | null;
}

export type DimensionKey =
  | "materiales"
  | "componentes"
  | "reciclabilidad"
  | "reciclado"
  | "peso";

export interface DimensionScore {
  key: DimensionKey;
  label: string;
  /** Peso nominal según la tabla de MB */
  weight: number;
  /** Peso real usado, tras repartir el de las dimensiones sin datos */
  effectiveWeight: number;
  /** 0-100, o null si no hay datos para evaluarla */
  score: number | null;
  /** Qué se midió, en una línea */
  detail: string;
}

/** Pesos definidos por MB */
export const DIMENSION_WEIGHTS: Record<DimensionKey, number> = {
  materiales: 0.25,
  componentes: 0.2,
  reciclabilidad: 0.25,
  reciclado: 0.15,
  peso: 0.15,
};

const LABELS: Record<DimensionKey, string> = {
  materiales: "Número de materiales",
  componentes: "Número de componentes",
  reciclabilidad: "Reciclabilidad de los materiales",
  reciclado: "Material reciclado incorporado",
  peso: "Peso del envase",
};

/** Umbrales definidos por MB */
export function levelOf(score: number): CircularityLevel {
  if (score >= 80) return "Excelente";
  if (score >= 60) return "Bueno";
  if (score >= 40) return "Mejorable";
  return "Crítico";
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Penalización lineal por cantidad: 1 es lo ideal y cada unidad extra descuenta
 * `step` puntos. Es el criterio de monomaterial y monocomponente del ecodiseño:
 * cada material y cada pieza adicional es una separación más que alguien tiene
 * que hacer para que el envase llegue a reciclarse.
 */
function countScore(n: number, step: number): number {
  return clamp(100 - (n - 1) * step);
}

export interface CircularityInput {
  pieces: CircularityPiece[];
  /**
   * Peso mediano de los envases comparables (misma familia o categoría). Es la
   * referencia de la dimensión "peso": el peso absoluto no dice nada suelto,
   * porque una botella de 2 L y un pote de yogurt no se comparan entre sí.
   * null = sin cohorte suficiente, la dimensión queda sin datos.
   */
  weightBenchmarkGrams: number | null;
}

export interface CircularityResult {
  score: number;
  level: CircularityLevel;
  dimensions: DimensionScore[];
  /** Dimensión evaluada con peor puntaje: por dónde conviene empezar */
  weakest: DimensionScore | null;
  /** Peso del envase evaluado: primario + secundario, sin transporte */
  totalWeightGrams: number;
  /** Piezas de transporte dejadas fuera, para que el alcance sea visible */
  excludedTertiary: number;
}

export function scoreCircularity(input: CircularityInput): CircularityResult {
  const { weightBenchmarkGrams } = input;
  const pieces = input.pieces.filter((p) => p.packagingType !== "tertiary");
  const excludedTertiary = input.pieces.length - pieces.length;
  const totalWeight = pieces.reduce((a, p) => a + p.weightGrams, 0);

  const raw: Array<Omit<DimensionScore, "effectiveWeight">> = [];

  // ── 1. Número de materiales ────────────────────────────────────
  const materiales = new Set(pieces.map((p) => p.materialDetail)).size;
  raw.push({
    key: "materiales",
    label: LABELS.materiales,
    weight: DIMENSION_WEIGHTS.materiales,
    score: pieces.length > 0 ? countScore(materiales, 25) : null,
    detail:
      materiales === 1
        ? "monomaterial"
        : `${materiales} materiales distintos`,
  });

  // ── 2. Número de componentes ───────────────────────────────────
  raw.push({
    key: "componentes",
    label: LABELS.componentes,
    weight: DIMENSION_WEIGHTS.componentes,
    score: pieces.length > 0 ? countScore(pieces.length, 20) : null,
    detail: `${pieces.length} pieza${pieces.length === 1 ? "" : "s"}`,
  });

  // ── 3. Reciclabilidad, ponderada por masa ──────────────────────
  //
  // Por masa y no por conteo: una etiqueta no reciclable de 0,2 g no puede
  // pesar lo mismo que una botella reciclable de 30 g.
  //
  // Una pieza reciclable CON GRASA cuenta la mitad. No es una opinión: los SIG
  // cobran la categoría "con grasa" más cara justamente porque la
  // contaminación baja la recuperación efectiva del material.
  let masaReciclable = 0;
  for (const p of pieces) {
    if (p.wasteType !== "recyclable") continue;
    masaReciclable += p.hasGrease ? p.weightGrams * 0.5 : p.weightGrams;
  }
  const pctReciclable = totalWeight > 0 ? (masaReciclable / totalWeight) * 100 : 0;
  const conGrasa = pieces.filter(
    (p) => p.wasteType === "recyclable" && p.hasGrease
  ).length;
  raw.push({
    key: "reciclabilidad",
    label: LABELS.reciclabilidad,
    weight: DIMENSION_WEIGHTS.reciclabilidad,
    score: totalWeight > 0 ? clamp(pctReciclable) : null,
    detail:
      `${r1(pctReciclable)}% de la masa es reciclable` +
      (conGrasa > 0 ? ` (${conGrasa} pieza(s) con grasa cuentan la mitad)` : ""),
  });

  // ── 4. Material reciclado incorporado ──────────────────────────
  //
  // El puntaje es directamente el % incorporado, ponderado por masa: 30% de
  // reciclado son 30 puntos. Es duro y es a propósito — no tiene sentido
  // premiar con 80 puntos a un envase con 30% de reciclado.
  //
  // El ORIGEN (nacional o importado) no entra acá: material reciclado es
  // material reciclado. El origen decidirá el descuento en la tarifa, que es un
  // efecto económico y se muestra en Costos, no una propiedad de circularidad.
  const declaradas = pieces.filter((p) => p.recycledPercentage !== null);
  const masaDeclarada = declaradas.reduce((a, p) => a + p.weightGrams, 0);
  const recicladoPonderado =
    masaDeclarada > 0
      ? declaradas.reduce(
          (a, p) => a + (p.recycledPercentage ?? 0) * p.weightGrams,
          0
        ) / masaDeclarada
      : null;
  raw.push({
    key: "reciclado",
    label: LABELS.reciclado,
    weight: DIMENSION_WEIGHTS.reciclado,
    score: recicladoPonderado === null ? null : clamp(recicladoPonderado),
    detail:
      recicladoPonderado === null
        ? "sin declarar"
        : `${r1(recicladoPonderado)}% de material reciclado`,
  });

  // ── 5. Peso del envase, contra envases comparables ─────────────
  //
  // La mediana de la cohorte vale 50 puntos, la mitad de la mediana 75 y el
  // doble 0. Pesar como el resto del catálogo no es ni bueno ni malo: es el
  // punto medio, y desde ahí se premia o se castiga.
  let pesoScore: number | null = null;
  let pesoDetalle = "sin envases comparables";
  if (weightBenchmarkGrams && weightBenchmarkGrams > 0 && totalWeight > 0) {
    const ratio = totalWeight / weightBenchmarkGrams;
    pesoScore = clamp(50 * (2 - ratio));
    pesoDetalle =
      `${r1(totalWeight)} g contra ${r1(weightBenchmarkGrams)} g de la mediana ` +
      `(${ratio >= 1 ? "+" : ""}${r1((ratio - 1) * 100)}%)`;
  }
  raw.push({
    key: "peso",
    label: LABELS.peso,
    weight: DIMENSION_WEIGHTS.peso,
    score: pesoScore,
    detail: pesoDetalle,
  });

  // ── Reparto del peso de las dimensiones sin datos ──────────────
  const evaluables = raw.filter((d) => d.score !== null);
  const sumaEvaluable = evaluables.reduce((a, d) => a + d.weight, 0);

  const dimensions: DimensionScore[] = raw.map((d) => ({
    ...d,
    effectiveWeight:
      d.score === null || sumaEvaluable === 0 ? 0 : d.weight / sumaEvaluable,
  }));

  const score =
    sumaEvaluable === 0
      ? 0
      : dimensions.reduce(
          (a, d) => a + (d.score ?? 0) * d.effectiveWeight,
          0
        );

  const weakest =
    evaluables.length > 0
      ? dimensions
          .filter((d) => d.score !== null)
          .reduce((a, b) => (b.score! < a.score! ? b : a))
      : null;

  return {
    score: r1(score),
    level: levelOf(score),
    dimensions,
    weakest,
    totalWeightGrams: r1(totalWeight),
    excludedTertiary,
  };
}
