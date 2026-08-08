/**
 * Qué cambió en las piezas de un SKU, para el registro de auditoría.
 *
 * `product.update` reemplaza las piezas enteras (borra e inserta), así que sin
 * esto el registro solo sabría decir cuántas piezas quedaron. Bajar el gramaje
 * de una pieza —el cambio de mayor impacto en el costo REP— no dejaba rastro.
 */

/**
 * Identidad de una pieza dentro de un SKU: su nombre y su segmento.
 *
 * No incluye el material a propósito. Cambiar el material de una pieza es un
 * cambio DE esa pieza, y con el material en la clave aparecería como una pieza
 * eliminada y otra agregada, que es justo lo que no se quiere leer en una
 * auditoría.
 */
export function pieceKey(p: {
  pieceName: string;
  isDomiciliary: boolean;
}): string {
  return `${p.pieceName.trim().toLowerCase()}|${p.isDomiciliary}`;
}

/** Campos de la pieza cuyo cambio hay que poder rastrear */
export const PIECE_AUDIT_FIELDS = [
  "materialClass",
  "materialDetail",
  "weightGrams",
  "packagingType",
  "wasteType",
  "hasGrease",
  "isHazardous",
  "notSubjectToRep",
  "recycledPercentage",
] as const;

/** Tope de detalle por categoría: una auditoría no es un volcado de la tabla */
export const MAX_AUDIT_DETAIL = 20;

export type AuditablePiece = {
  pieceName: string;
  isDomiciliary: boolean;
  materialDetail?: string | null;
  weightGrams?: number;
} & Partial<Record<(typeof PIECE_AUDIT_FIELDS)[number], unknown>>;

/**
 * Normaliza antes de comparar.
 *
 * El peso es float (7,7 puede volver como 7,699999) y el porcentaje sale de la
 * base como texto, así que sin normalizar cada guardado registraría cambios
 * que no ocurrieron.
 */
function comparable(field: string, value: unknown): unknown {
  if (value === null || value === undefined || value === "") return null;
  if (field === "weightGrams") return Math.round(Number(value) * 1e4) / 1e4;
  if (field === "recycledPercentage") return Number(value);
  return value;
}

export function diffPieces(
  before: AuditablePiece[],
  after: AuditablePiece[]
): Record<string, unknown> {
  const agrupar = (list: AuditablePiece[]) => {
    const m = new Map<string, AuditablePiece[]>();
    for (const p of list) {
      const k = pieceKey(p);
      const arr = m.get(k);
      if (arr) arr.push(p);
      else m.set(k, [p]);
    }
    return m;
  };
  const antes = agrupar(before);
  const ahora = agrupar(after);

  const agregadas: string[] = [];
  const eliminadas: string[] = [];
  const modificadas: Array<Record<string, unknown>> = [];

  const etiqueta = (p: AuditablePiece) =>
    `${p.pieceName} (${p.materialDetail ?? "?"}, ${p.weightGrams ?? "?"} g)`;

  for (const [key, listaAhora] of ahora) {
    const listaAntes = antes.get(key) ?? [];
    for (let i = 0; i < listaAhora.length; i++) {
      const b = listaAntes[i];
      if (!b) {
        agregadas.push(etiqueta(listaAhora[i]));
        continue;
      }
      const campos: Record<string, unknown> = {};
      for (const campo of PIECE_AUDIT_FIELDS) {
        const va = comparable(campo, b[campo]);
        const vb = comparable(campo, listaAhora[i][campo]);
        if (va !== vb) campos[campo] = { antes: va, ahora: vb };
      }
      if (Object.keys(campos).length > 0) {
        modificadas.push({
          pieza: listaAhora[i].pieceName,
          segmento: listaAhora[i].isDomiciliary ? "DOM" : "NO DOM",
          ...campos,
        });
      }
    }
  }

  for (const [key, listaAntes] of antes) {
    const sobrantes = listaAntes.slice((ahora.get(key) ?? []).length);
    for (const p of sobrantes) eliminadas.push(etiqueta(p));
  }

  const acotar = <T>(xs: T[]) =>
    xs.length > MAX_AUDIT_DETAIL
      ? { total: xs.length, muestra: xs.slice(0, MAX_AUDIT_DETAIL) }
      : xs;

  const resultado: Record<string, unknown> = {};
  if (agregadas.length) resultado.agregadas = acotar(agregadas);
  if (eliminadas.length) resultado.eliminadas = acotar(eliminadas);
  if (modificadas.length) resultado.modificadas = acotar(modificadas);
  return resultado;
}
