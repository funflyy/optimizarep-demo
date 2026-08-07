/**
 * report-stamp.ts — Procedencia de los archivos exportados.
 *
 * Un Excel de costos filtrado a marzo 2025 y ReSimple es idéntico, por fuera,
 * al del año completo. Cuando estos archivos circulan por correo y se acumulan
 * tres versiones en la misma carpeta, no hay cómo saber cuál es cuál ni qué
 * filtros lo produjeron.
 *
 * Por eso todo export lleva la fecha y hora de generación, quién lo generó y el
 * alcance de los datos: en el nombre del archivo, en una hoja aparte del Excel
 * y en el pie de cada página del PDF.
 */
import type { jsPDF } from "jspdf";

export interface ReportContext {
  /** Nombre del reporte, tal como se le dice al usuario */
  report: string;
  /** Organización a la que corresponden los datos */
  organization?: string | null;
  /** Quién lo generó */
  user?: string | null;
  /**
   * Filtros aplicados. Lo que distingue este archivo de otro con el mismo
   * nombre: año, mes, SIG, producto prioritario.
   */
  scope?: Record<string, string | number | null | undefined>;
}

/** "7 de agosto de 2026, 19:34" */
export function generatedAtLabel(date = new Date()): string {
  return date.toLocaleString("es-CL", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * "2026-08-07_1934" — ordenable alfabéticamente, que es como se ven en una
 * carpeta. Sin `:` ni `/`, que Windows no acepta en nombres de archivo.
 */
export function fileTimestamp(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}` +
    `_${p(date.getHours())}${p(date.getMinutes())}`
  );
}

/** `Costos_REP` → `Costos_REP_2026-08-07_1934` */
export function stampedFilename(base: string, date = new Date()): string {
  return `${base}_${fileTimestamp(date)}`;
}

/** Filtros en una línea: "Año: 2025 · Mes: marzo · SIG: ReSimple" */
export function scopeLabel(ctx: ReportContext): string {
  const parts = Object.entries(ctx.scope ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${v}`);
  return parts.join(" · ");
}

/** Filas de metadatos, en el orden en que sirven para leerlas */
export function stampRows(
  ctx: ReportContext,
  date = new Date()
): Array<{ Campo: string; Valor: string }> {
  const rows = [
    { Campo: "Reporte", Valor: ctx.report },
    { Campo: "Generado", Valor: generatedAtLabel(date) },
  ];
  if (ctx.organization) rows.push({ Campo: "Organización", Valor: ctx.organization });
  if (ctx.user) rows.push({ Campo: "Generado por", Valor: ctx.user });
  for (const [k, v] of Object.entries(ctx.scope ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    rows.push({ Campo: k, Valor: String(v) });
  }
  rows.push({ Campo: "Origen", Valor: "OptimizaREP" });
  return rows;
}

/**
 * Hoja de procedencia al final del libro.
 *
 * Va al final y no al principio a propósito: la primera hoja es la que se abre
 * al hacer doble clic, y ahí tiene que estar el dato, no la ficha técnica.
 */
export function appendStampSheet(
  XLSX: typeof import("xlsx"),
  wb: import("xlsx").WorkBook,
  ctx: ReportContext,
  date = new Date()
): void {
  const ws = XLSX.utils.json_to_sheet(stampRows(ctx, date));
  ws["!cols"] = [{ wch: 22 }, { wch: 52 }];
  XLSX.utils.book_append_sheet(wb, ws, "Generado");
}

/**
 * Pie de página en TODAS las páginas del PDF, con numeración.
 *
 * Se llama al final, cuando ya existen todas las páginas: jsPDF no puede
 * escribir en páginas que todavía no se crearon, así que un pie dibujado
 * durante la construcción solo alcanzaría a la primera.
 */
export function drawPdfFooter(
  doc: jsPDF,
  ctx: ReportContext,
  date = new Date()
): void {
  const total = doc.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const scope = scopeLabel(ctx);
  const left =
    `Generado el ${generatedAtLabel(date)}` +
    (ctx.organization ? ` · ${ctx.organization}` : "") +
    (scope ? ` · ${scope}` : "");

  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(130, 130, 130);
    doc.text(left, 14, pageH - 6);
    doc.text(`Página ${i} de ${total}`, pageW - 14, pageH - 6, {
      align: "right",
    });
  }
  doc.setTextColor(0, 0, 0);
}
