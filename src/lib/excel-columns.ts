/**
 * Lectura tolerante de cabeceras de Excel.
 *
 * Los archivos de los clientes varían en espacios, acentos y mayúsculas:
 * "Peso (g)", "Peso(g)" y "PESO G" deben resolver a la misma columna.
 *
 * Bug línea base productos: la cabecera real era "Peso (g)" (con espacio) y la
 * búsqueda exacta `row["Peso(g)"]` devolvía undefined → peso 0 → todas las
 * filas quedaban inválidas ("0 válidos, 63 con errores").
 */

/** Normaliza una cabecera: sin acentos, sin símbolos, minúscula. */
export function normalizeHeader(key: string): string {
  return key
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // marcas diacríticas
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Indexa una fila de `sheet_to_json` por cabecera normalizada.
 * Si dos cabeceras normalizan igual, gana la primera con valor no vacío.
 */
export function indexRow(row: Record<string, unknown>): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [rawKey, value] of Object.entries(row)) {
    const key = normalizeHeader(rawKey);
    if (!key) continue;
    const isEmpty = value === undefined || value === null || String(value).trim() === "";
    if (!out.has(key) || (isEmptyValue(out.get(key)) && !isEmpty)) out.set(key, value);
  }
  return out;
}

function isEmptyValue(v: unknown): boolean {
  return v === undefined || v === null || String(v).trim() === "";
}

/** Primer alias con valor presente en la fila indexada. */
export function pick(
  row: Map<string, unknown>,
  ...aliases: string[]
): unknown {
  for (const alias of aliases) {
    const v = row.get(normalizeHeader(alias));
    if (!isEmptyValue(v)) return v;
  }
  return undefined;
}

/** Texto normalizado de un alias (para comparaciones), "" si no está. */
export function pickText(row: Map<string, unknown>, ...aliases: string[]): string {
  const v = pick(row, ...aliases);
  return v === undefined ? "" : String(v).trim();
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
};

/**
 * "Enero" | "enero" | 1 | "01" → 1. Devuelve 0 (= anual) si no se reconoce,
 * que es el valor que `sales_records.month` usa para períodos anuales.
 */
export function parseMonth(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 1 && value <= 12 ? value : 0;
  }
  const raw = String(value).trim();
  if (!raw) return 0;
  const byName = MESES[normalizeHeader(raw)];
  if (byName) return byName;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : 0;
}

/** Interpreta Sí/No/1/0/true/false del Excel. `undefined` si no se reconoce. */
export function parseBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value;
  const s = normalizeHeader(String(value));
  if (!s) return undefined;
  if (["si", "s", "1", "true", "verdadero", "x"].includes(s)) return true;
  if (["no", "n", "0", "false", "falso"].includes(s)) return false;
  return undefined;
}

/**
 * Valor más frecuente de una lista; en empate, el mayor.
 *
 * Se usa para las ventas de un período: el Excel repite el mismo total en cada
 * fila de pieza, así que la moda descarta un valor tipeado mal en una sola fila.
 */
export function modeOrMax(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const freq = new Map<number, number>();
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
  let best = values[0];
  let bestCount = 0;
  for (const [value, count] of freq) {
    if (count > bestCount || (count === bestCount && value > best)) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}
