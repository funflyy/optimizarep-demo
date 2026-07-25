/**
 * Branding OptimizaREP — verde #7fba2d, verde oscuro #0b442e.
 * Los colores de residuos son estándar del cliente: cada material se
 * grafica SIEMPRE con su color, independiente del orden en el chart.
 */

/** Colores de residuos por material (nomenclatura red) */
export const WASTE_COLORS: Record<string, string> = {
  "papel y cartón": "#E84038",
  "papeles y cartones": "#E84038",
  celulosa: "#E84038", // alias interno legacy → color de papel y cartón
  plástico: "#643615",
  plásticos: "#643615",
  pet: "#643615",
  metal: "#DDC8A9",
  metales: "#DDC8A9",
  "latas y metales": "#DDC8A9",
  vidrio: "#E8DB3C",
  vidrios: "#E8DB3C",
  orgánico: "#0C632E",
  "desechos orgánicos": "#0C632E",
  "cartón para bebidas": "#5B1C4B",
  "cartón para líquidos": "#5B1C4B",
  cpl: "#5B1C4B",
  raee: "#C6C6C9",
  peligroso: "#006AAB",
  "residuos peligrosos": "#006AAB",
  otros: "#44555F",
};

/** Paleta aplicativa (fallback para series sin material asociado) */
export const APP_PALETTE = [
  "#7fba2d", // verde OptimizaREP
  "#0b442e", // verde oscuro OptimizaREP
  "#E78402", // naranjo
  "#172A48", // navy
  "#00A19A", // verde agua
  "#FBBF5B", // naranjo claro
  "#0095B4", // cian
  "#208D5E", // verde
  "#E51973", // magenta
  "#174344", // teal oscuro
];

/** Color para un material según branding; fallback a paleta por índice */
export function wasteColor(material: string, fallbackIndex = 0): string {
  const key = material.trim().toLowerCase();
  return (
    WASTE_COLORS[key] ?? APP_PALETTE[fallbackIndex % APP_PALETTE.length]
  );
}
