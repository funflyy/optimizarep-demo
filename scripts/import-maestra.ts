/**
 * Importa taxonomías legales y metas de cumplimiento desde
 * "MAESTRA BBDD REP_VF2.0.xlsx".
 *
 *   📚 Listas REP           → rep_categories (los 5 productos prioritarios)
 *   📦 ENV · Cumplimiento   → metas DOM (art. 21) y NO DOM (art. 23)
 *   🚗 NEU · Cumplimiento   → metas Cat. A (arts. 20-21) y Cat. B (art. 21)
 *   🛢️ ALU · Cumplimiento   → metas art. 17 D.S. 47/2023
 *   🔋 P+RAEE · Cumplimiento → metas general / AIT / PFV, D.S. 22/2025
 *
 * OJO — cada hoja expresa los porcentajes de forma distinta. Cargarlos sin
 * normalizar dejaría las metas de ALU en 0,5% en vez de 50%:
 *
 *   ENV      5, 8, 11         ya son %          → "plain"
 *   NEU      50, 25           ya son %          → "plain"
 *   ALU      0.5, 0.52, 0.9   fracción de 1     → "fraction"
 *   P+RAEE   "3%", "45%"      texto con símbolo → "text"
 *
 * Los años en régimen vienen como "1".."11" y "≥12" / "≥9" / "≥10"; el "≥N" se
 * guarda como N (es la meta en régimen permanente).
 *
 * Idempotente: upsert de rep_categories por (producto, código, subcategoría) y
 * borrado+recarga de las metas de cada producto prioritario que se procesa.
 *
 * Uso: pnpm tsx scripts/import-maestra.ts [ruta/al/archivo.xlsx]
 */
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as schema from "../src/server/db/schema";

loadEnvConfig(process.cwd());

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL (revisar .env.local)");
  process.exit(1);
}

const DEFAULT_PATH = join(
  homedir(),
  "Downloads",
  "MAESTRA BBDD REP_VF2.0.xlsx"
);

type Row = unknown[];
type PctStyle = "plain" | "fraction" | "text";

const txt = (v: unknown) => String(v ?? "").replace(/\r?\n/g, " ").trim();

/** "≥12" → 12 · "1" → 1 · otra cosa → undefined */
function regimeYear(v: unknown): number | undefined {
  const m = txt(v).match(/(\d+)/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 1 && n <= 60 ? n : undefined;
}

/** "2027" → 2027 · "≥2038" → 2038 · otra cosa → undefined */
function calendarYear(v: unknown): number | undefined {
  const m = txt(v).match(/(\d{4})/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return n >= 2000 && n <= 2100 ? n : undefined;
}

/** Normaliza el porcentaje según la convención de la hoja. */
function pct(v: unknown, style: PctStyle): number | undefined {
  const raw = txt(v);
  if (!raw || raw === "—" || raw === "-") return undefined;
  const n = Number(raw.replace("%", "").replace(",", "."));
  if (!Number.isFinite(n)) return undefined;
  if (style === "fraction") return Math.round(n * 100 * 100) / 100;
  return Math.round(n * 100) / 100;
}

/** "0,84" → 0.84 */
function decimalOrNull(v: unknown): string | null {
  const raw = txt(v).replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? String(n) : null;
}

/** Índice de la fila cuya primera celda coincide, desde `from`. */
function findRow(rows: Row[], re: RegExp, from = 0): number {
  for (let i = from; i < rows.length; i++) {
    if (re.test(txt(rows[i]?.[0]))) return i;
  }
  return -1;
}

/** Filas de datos tras un encabezado, hasta que la 1ª celda deje de tener año. */
function dataRowsAfter(rows: Row[], headerIdx: number): Row[] {
  const out: Row[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    if (regimeYear(rows[i]?.[0]) === undefined) break;
    out.push(rows[i]);
  }
  return out;
}

async function main() {
  const path = process.argv[2] ?? DEFAULT_PATH;
  if (!existsSync(path)) {
    console.error(`No existe el archivo: ${path}`);
    process.exit(1);
  }

  const sql = postgres(DATABASE_URL!, { max: 1 });
  const db = drizzle(sql, { schema });

  console.log(`Leyendo ${path}\n`);
  const wb = XLSX.read(readFileSync(path), { type: "buffer" });
  const sheet = (name: string): Row[] => {
    const ws = wb.Sheets[name];
    if (!ws) throw new Error(`No existe la hoja "${name}"`);
    return XLSX.utils.sheet_to_json<Row>(ws, { header: 1, blankrows: false });
  };

  const pps = await db.select().from(schema.priorityProducts);
  const ppId = (code: string) => {
    const pp = pps.find((p) => p.code === code);
    if (!pp)
      throw new Error(
        `Falta el producto prioritario "${code}" — correr antes: pnpm tsx scripts/seed-catalogs.ts`
      );
    return pp.id;
  };

  // ── rep_categories, desde "📚 Listas REP" ──────────────────────
  const listas = sheet("📚 Listas REP");
  const cats: {
    priorityProductId: string;
    code: string;
    subcategory: string;
    description: string;
    wearFactor: string | null;
    subjectToRep: boolean;
    sortOrder: number;
  }[] = [];

  // Títulos de sección de la hoja, en orden. Cada bloque termina donde
  // empieza el siguiente: detectar el fin por heurística de texto fallaba
  // (el título "RAEE — CATEGORÍAS…" no se reconocía y sus 17 categorías
  // terminaban cargadas como si fueran de envases).
  const SECTIONS: { re: RegExp; pp: string }[] = [
    { re: /^NEUM[ÁA]TICOS —/, pp: "neumaticos" },
    { re: /^ENVASES Y EMBALAJES —/, pp: "envases_embalajes" },
    { re: /^RAEE —/, pp: "raee" },
    { re: /^ACEITES LUBRICANTES —/, pp: "aceites_lubricantes" },
    // Última sección: llega hasta el fin de la hoja. La fila "EXCLUIDOS del
    // D.S. 22" entra como categoría con subjectToRep = false, igual que los
    // neumáticos exentos y los aceites no recuperables.
    { re: /^PILAS \+ AEE —/, pp: "pilas_aee" },
  ];
  const bounds = SECTIONS.map((s) => ({ ...s, at: findRow(listas, s.re) }));

  /** Lee un bloque de la hoja de listas, acotado por la sección siguiente. */
  function readBlock(
    startRe: RegExp,
    ppCode: string,
    map: (r: Row, i: number) => {
      code: string;
      subcategory?: string;
      description?: string;
      wearFactor?: string | null;
    }[]
  ) {
    // Comparar por `source`: cada llamada pasa un literal distinto, así que
    // la igualdad por referencia nunca coincide.
    const idx = bounds.findIndex((b) => b.re.source === startRe.source);
    const sec = bounds[idx]?.at ?? -1;
    if (sec < 0) {
      console.log(`⚠ no se encontró la sección ${startRe}`);
      return;
    }
    // Fin = inicio de la siguiente sección encontrada (o fin de hoja)
    const end =
      bounds
        .slice(idx + 1)
        .map((b) => b.at)
        .find((at) => at > sec) ?? listas.length;

    let order = 0;
    for (let i = sec + 2; i < end; i++) {
      const first = txt(listas[i]?.[0]);
      if (!first) break;
      if (/^categor[íi]a/i.test(first)) continue;
      for (const m of map(listas[i], order)) {
        cats.push({
          priorityProductId: ppId(ppCode),
          code: m.code,
          subcategory: m.subcategory ?? "",
          description: m.description ?? "",
          wearFactor: m.wearFactor ?? null,
          subjectToRep: !/exento|excluido|no recuperable/i.test(
            `${first} ${txt(listas[i]?.[2])}`
          ),
          sortOrder: order++,
        });
      }
    }
  }

  readBlock(/^NEUM[ÁA]TICOS —/, "neumaticos", (r) => [
    {
      // "3 (exento)" → "3"
      code: txt(r[0]).replace(/\s*\(exento\)/i, ""),
      description: txt(r[1]),
      wearFactor: decimalOrNull(r[2]),
    },
  ]);

  readBlock(/^ENVASES Y EMBALAJES —/, "envases_embalajes", (r) => {
    const raw = txt(r[0]);
    const sub = txt(r[1]) === "—" ? "" : txt(r[1]);
    const desc = txt(r[2]);
    // "DOM y NO DOM" aplica a ambos segmentos → dos filas
    if (/^DOM y NO DOM$/i.test(raw)) {
      return [
        { code: "DOM", subcategory: sub, description: desc },
        { code: "NO DOM", subcategory: sub, description: desc },
      ];
    }
    // "DOM (Domiciliario)" → "DOM"
    const code = raw.replace(/\s*\(.*\)$/, "");
    return [{ code, subcategory: sub, description: desc }];
  });

  readBlock(/^RAEE —/, "raee", (r) => [
    { code: txt(r[0]), subcategory: txt(r[1]), description: txt(r[2]) },
  ]);

  readBlock(/^ACEITES LUBRICANTES —/, "aceites_lubricantes", (r) => [
    { code: txt(r[0]), description: txt(r[1]) },
  ]);

  readBlock(/^PILAS \+ AEE —/, "pilas_aee", (r) => [
    { code: txt(r[0]).replace(/\s*—.*$/, ""), description: txt(r[1]) },
  ]);

  // Recarga limpia: si un bloque se leyó mal antes, el upsert dejaría las
  // filas viejas huérfanas en el producto prioritario equivocado.
  for (const id of new Set(cats.map((c) => c.priorityProductId))) {
    await db
      .delete(schema.repCategories)
      .where(eq(schema.repCategories.priorityProductId, id));
  }

  let catCount = 0;
  for (const c of cats) {
    await db
      .insert(schema.repCategories)
      .values(c)
      .onConflictDoUpdate({
        target: [
          schema.repCategories.priorityProductId,
          schema.repCategories.code,
          schema.repCategories.subcategory,
        ],
        set: {
          description: c.description,
          wearFactor: c.wearFactor,
          subjectToRep: c.subjectToRep,
          sortOrder: c.sortOrder,
        },
      });
    catCount++;
  }
  console.log(`rep_categories: ${catCount} filas`);
  for (const code of [
    "neumaticos",
    "envases_embalajes",
    "raee",
    "aceites_lubricantes",
    "pilas_aee",
  ]) {
    const n = cats.filter((c) => c.priorityProductId === ppId(code)).length;
    console.log(`   ${code.padEnd(22)} ${n}`);
  }

  // ── compliance_goals ───────────────────────────────────────────
  const goals: {
    priorityProductId: string;
    goalType: string;
    regimeYear: number;
    calendarYear: number | null;
    percentage: string;
    legalRef: string;
    label: string;
  }[] = [];

  /** Tabla año × columnas de material/categoría. */
  function readGoalTable(
    rows: Row[],
    sectionRe: RegExp,
    ppCode: string,
    style: PctStyle,
    legalRef: string,
    goalType: (colHeader: string) => string,
    calendarCol?: number
  ) {
    const sec = findRow(rows, sectionRe);
    if (sec < 0) {
      console.log(`⚠ no se encontró ${sectionRe}`);
      return;
    }
    const headerIdx = findRow(rows, /^A[ñn]o/i, sec);
    if (headerIdx < 0) return;
    const headers = (rows[headerIdx] ?? []).map(txt);

    for (const r of dataRowsAfter(rows, headerIdx)) {
      const ry = regimeYear(r[0]);
      if (ry === undefined) continue;
      const calYear =
        calendarCol !== undefined ? calendarYear(r[calendarCol]) : undefined;
      for (let c = 1; c < headers.length; c++) {
        if (calendarCol !== undefined && c >= calendarCol) break;
        const h = headers[c];
        if (!h || /observ|nota|obs\./i.test(h)) continue;
        const p = pct(r[c], style);
        if (p === undefined) continue;
        goals.push({
          priorityProductId: ppId(ppCode),
          goalType: goalType(h),
          regimeYear: ry,
          calendarYear: calYear ?? null,
          percentage: String(p),
          legalRef,
          label: h,
        });
      }
    }
  }

  const env = sheet("📦 ENV · Cumplimiento");
  readGoalTable(env, /^METAS DOM/, "envases_embalajes", "plain", "art. 21", () => "recoleccion");
  readGoalTable(env, /^METAS NO DOM/, "envases_embalajes", "plain", "art. 23", () => "valorizacion");

  const neu = sheet("🚗 NEU · Cumplimiento");
  readGoalTable(neu, /CATEGOR[ÍI]A A/, "neumaticos", "plain", "arts. 20-21", (h) =>
    /valoriza/i.test(h) ? "valorizacion" : "recoleccion"
  );
  readGoalTable(neu, /CATEGOR[ÍI]A B/, "neumaticos", "plain", "art. 21", () => "valorizacion");

  const alu = sheet("🛢️ ALU · Cumplimiento");
  readGoalTable(alu, /^METAS ANUALES/, "aceites_lubricantes", "fraction", "art. 17", () => "general", 4);

  const pr = sheet("🔋 P+RAEE · Cumplimiento");
  readGoalTable(pr, /^METAS ANUALES/, "pilas_aee", "text", "D.S. 22/2025", (h) =>
    /espec[íi]fica/i.test(h) ? "especifica" : "general", 4
  );

  // Recarga limpia por producto prioritario procesado
  const touched = [...new Set(goals.map((g) => g.priorityProductId))];
  for (const id of touched) {
    await db
      .delete(schema.complianceGoals)
      .where(eq(schema.complianceGoals.priorityProductId, id));
  }
  for (const g of goals) {
    await db.insert(schema.complianceGoals).values({
      priorityProductId: g.priorityProductId,
      goalType: g.goalType,
      regimeYear: g.regimeYear,
      calendarYear: g.calendarYear,
      percentage: g.percentage,
      legalRef: g.legalRef,
    });
  }

  console.log(`\ncompliance_goals: ${goals.length} filas`);
  const byPp = new Map<string, number>();
  for (const g of goals)
    byPp.set(g.priorityProductId, (byPp.get(g.priorityProductId) ?? 0) + 1);
  for (const [id, n] of byPp) {
    console.log(`   ${pps.find((p) => p.id === id)?.code?.padEnd(22)} ${n}`);
  }

  // Verificación visible: rangos por producto y tipo
  console.log("\n=== VERIFICACIÓN (min/max % por producto y tipo) ===");
  const seen = new Map<string, number[]>();
  for (const g of goals) {
    const code = pps.find((p) => p.id === g.priorityProductId)?.code ?? "?";
    const k = `${code} · ${g.goalType}`;
    if (!seen.has(k)) seen.set(k, []);
    seen.get(k)!.push(Number(g.percentage));
  }
  for (const [k, v] of [...seen].sort()) {
    console.log(`  ${k.padEnd(40)} ${Math.min(...v)}% .. ${Math.max(...v)}%  (n=${v.length})`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
