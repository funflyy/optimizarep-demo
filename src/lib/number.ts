/**
 * Parseo y formato numérico — maneja formatos chilenos y anglosajones.
 *
 * Bug reunión 11-jul: "74,8" parseado como 74800 (o NaN → 0).
 * Regla: el ÚLTIMO separador presente se asume decimal; el otro, miles.
 * Un punto seguido de grupos de exactamente 3 dígitos ("74.800", "1.234.567")
 * se interpreta como separador de miles (formato es-CL).
 */
export function parseDecimal(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;

  let s = String(value).trim().replace(/\s| /g, "");
  if (!s) return 0;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // El último separador es el decimal
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", "."); // 1.234,56 → 1234.56
    } else {
      s = s.replace(/,/g, ""); // 1,234.56 → 1234.56
    }
  } else if (hasComma) {
    // Coma sola = decimal es-CL ("74,8"), o miles si son grupos de 3 ("1,234,567")
    s = /^\d{1,3}(,\d{3})+$/.test(s)
      ? s.replace(/,/g, "")
      : s.replace(/,/g, ".");
  } else if (hasDot) {
    // Punto solo: miles es-CL si son grupos de 3 ("74.800"), si no decimal ("74.8")
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Formatea en UF con 2 decimales, estilo es-CL: 1.234,56 */
export function formatUF(value: number, decimals = 2): string {
  return value.toLocaleString("es-CL", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Formatea en pesos chilenos sin decimales: $1.234.567 */
export function formatCLP(value: number): string {
  return value.toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
}
