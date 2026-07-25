/**
 * Seed definitivo — MAESTRA BBDD REP_VF2.0.xlsx (reunión 11-jul-2026)
 * + tarifas 2026 de "Plataforma REP_Línea Base.xlsx".
 *
 * Carga los 5 productos prioritarios con sus taxonomías legales, metas por
 * decreto, sistemas de gestión, tarifas, y los catálogos/líneas base de
 * ejemplo enviados por el cliente (un productor = una organización).
 *
 * Ejecutar: pnpm db:seed   (VACÍA los datos existentes, conserva uf_values)
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq as eqOp, and as andOp } from "drizzle-orm";
import * as schema from "./schema";
import * as XLSX from "xlsx";
import { parseDecimal } from "../../lib/number";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/impactarep";

const sql = postgres(DATABASE_URL);
const db = drizzle(sql, { schema });

const DOCS_DIR = "c:/Users/lucho/Documents/pybot/new_projects/impactarep_documentos";
const MAESTRA = `${DOCS_DIR}/reunion-11-jul/MAESTRA BBDD REP_VF2.0.xlsx`;
const LINEA_BASE = `${DOCS_DIR}/Plataforma REP_Línea Base.xlsx`;

// ── Helpers ─────────────────────────────────────────────────────

type Row = (string | number | null)[];

function sheetRows(wb: XLSX.WorkBook, name: string): Row[] {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`Hoja no encontrada: ${name}`);
  return XLSX.utils.sheet_to_json<Row>(ws, { header: 1, defval: null, raw: true });
}

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

/** Filas de datos de un catálogo/línea base: desde idx 4, sin notas (📐/⚖️) */
function dataRows(rows: Row[]): Row[] {
  const out: Row[] = [];
  for (let i = 4; i < rows.length; i++) {
    const first = s(rows[i]?.[0]);
    if (!first || first.startsWith("📐") || first.startsWith("⚖")) continue;
    out.push(rows[i]);
  }
  return out;
}

/** Busca el índice de la fila cuyo primer texto no nulo empieza con `prefix` */
function findRow(rows: Row[], prefix: string, from = 0): number {
  for (let i = from; i < rows.length; i++) {
    const cell = rows[i]?.find((c) => c !== null);
    if (s(cell).startsWith(prefix)) return i;
  }
  throw new Error(`Bloque no encontrado: "${prefix}"`);
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};
const month = (v: unknown) => MESES[s(v).toLowerCase()] ?? 0;

/** "≥8" | "8" | 8 → 8 */
const regimeYear = (v: unknown) => Math.round(parseDecimal(s(v).replace(/[≥>=\s]/g, "")));

/** "3%" | 0.5 | 50 → porcentaje 0-100 */
function pct(v: unknown): number {
  const raw = s(v).replace("%", "");
  const n = parseDecimal(raw);
  return n <= 1 && n > 0 ? n * 100 : n;
}

async function main() {
  console.log("🌱 Seed definitivo ImpactaREP (MAESTRA BBDD v2.0)\n");

  // ── 0. Limpiar (conserva uf_values) ───────────────────────────
  await sql`TRUNCATE organizations, users, products, product_pieces, sales_records,
    management_systems, tariff_categories, tariffs, tariff_mappings,
    priority_products, organization_priority_products, rep_categories,
    compliance_goals, homologated_categories, tariff_category_homologations,
    custom_field_definitions, declarations, audit_log CASCADE`;
  console.log("🧹 Tablas vaciadas (uf_values conservada)");

  const wb = XLSX.readFile(MAESTRA);

  // ── 1. Productos Prioritarios ──────────────────────────────────
  const ppDefs = [
    { code: "neumaticos", name: "Neumáticos", decree: "D.S. 8/2019", legalBasis: "Metas arts. 20-21; factores de desgaste Cat.A 0,84 / Cat.B 0,75 (art. 24)", nativeUnit: "kg", goalsEffectiveFrom: 2023, sortOrder: 1 },
    { code: "envases_embalajes", name: "Envases y Embalajes", decree: "D.S. 12/2020", legalBasis: "Metas DOM (art. 21) y NO DOM (art. 23) por subcategoría; exención <300 kg/año o microempresa", nativeUnit: "g", goalsEffectiveFrom: 2023, sortOrder: 2 },
    { code: "raee", name: "Aparatos Eléctricos y Electrónicos (RAEE)", decree: "Guía MMA / Ley 20.920", legalBasis: "6 categorías según guía MMA; declaración RETC en Ventanilla Única", nativeUnit: "kg", goalsEffectiveFrom: null as number | null, sortOrder: 3 },
    { code: "aceites_lubricantes", name: "Aceites Lubricantes", decree: "D.S. 47/2023", legalBasis: "Solo recuperables sujetos a metas (50%→90%); exención ≤66 L/año; litros × densidad", nativeUnit: "L", goalsEffectiveFrom: 2027, sortOrder: 4 },
    { code: "pilas_aee", name: "Pilas y AEE (D.S. 22)", decree: "D.S. 22/2025", legalBasis: "AIT / PFV / Otros AEE / Pila; meta general + específicas; base promedio 3 años", nativeUnit: "kg", goalsEffectiveFrom: 2028, sortOrder: 5 },
  ];
  const ppRows = await db.insert(schema.priorityProducts).values(ppDefs).returning();
  const pp = Object.fromEntries(ppRows.map((r) => [r.code, r.id]));
  console.log(`✓ ${ppRows.length} productos prioritarios`);

  // ── 2. Categorías legales REP (hoja "📚 Listas REP") ───────────
  const listas = sheetRows(wb, "📚 Listas REP");
  const repCats: (typeof schema.repCategories.$inferInsert)[] = [];

  // Neumáticos (Categoría | Descripción | FD)
  {
    const h = findRow(listas, "NEUMÁTICOS");
    for (let i = h + 2; s(listas[i]?.[0]); i++) {
      const [code, desc, fd] = [s(listas[i][0]), s(listas[i][1]), s(listas[i][2])];
      const exempt = code.includes("exento") || fd.includes("NO sujeto");
      repCats.push({
        priorityProductId: pp.neumaticos,
        code: code.replace(/\s*\(exento\)/, ""),
        subcategory: "",
        description: desc,
        wearFactor: exempt ? null : parseDecimal(fd).toFixed(4),
        subjectToRep: !exempt,
        sortOrder: i - h,
      });
    }
  }
  // Envases (Categoría | Subcategoría | Notas)
  {
    const h = findRow(listas, "ENVASES Y EMBALAJES");
    for (let i = h + 2; s(listas[i]?.[0]); i++) {
      const [code, sub, notes] = [s(listas[i][0]), s(listas[i][1]), s(listas[i][2])];
      repCats.push({
        priorityProductId: pp.envases_embalajes,
        code,
        subcategory: sub === "—" ? "" : sub,
        description: notes,
        subjectToRep: !code.startsWith("Reutilizables"),
        sortOrder: i - h,
      });
    }
  }
  // RAEE (Categoría | Subcategoría | Ejemplos)
  {
    const h = findRow(listas, "RAEE — CATEGORÍAS");
    for (let i = h + 2; s(listas[i]?.[0]); i++) {
      const [code, sub, ex] = [s(listas[i][0]), s(listas[i][1]), s(listas[i][2])];
      repCats.push({
        priorityProductId: pp.raee,
        code: code.split("—")[0].trim().slice(0, 50),
        subcategory: sub,
        description: ex,
        subjectToRep: true,
        sortOrder: i - h,
      });
    }
  }
  // Aceites (Categoría | Descripción | Meta/Obs)
  {
    const h = findRow(listas, "ACEITES LUBRICANTES");
    for (let i = h + 2; s(listas[i]?.[0]); i++) {
      const [code, desc, obs] = [s(listas[i][0]), s(listas[i][1]), s(listas[i][2])];
      repCats.push({
        priorityProductId: pp.aceites_lubricantes,
        code,
        subcategory: "",
        description: `${desc} · ${obs}`,
        subjectToRep: code === "Recuperable",
        sortOrder: i - h,
      });
    }
  }
  // Pilas + AEE (Categoría | Descripción | Metas)
  {
    const h = findRow(listas, "PILAS + AEE");
    for (let i = h + 2; s(listas[i]?.[0]); i++) {
      const [code, desc, obs] = [s(listas[i][0]), s(listas[i][1]), s(listas[i][2])];
      const excluded = code.startsWith("EXCLUIDOS");
      repCats.push({
        priorityProductId: pp.pilas_aee,
        code: excluded ? "Excluidos" : code.split("—")[0].trim().slice(0, 50),
        subcategory: "",
        description: `${desc} · ${obs}`,
        subjectToRep: !excluded,
        sortOrder: i - h,
      });
    }
  }
  const repCatRows = await db.insert(schema.repCategories).values(repCats).returning();
  const repCatId = (ppId: string, code: string, sub = "") =>
    repCatRows.find(
      (r) =>
        r.priorityProductId === ppId &&
        r.code.toLowerCase().startsWith(code.toLowerCase()) &&
        (sub === "" || r.subcategory.toLowerCase().startsWith(sub.toLowerCase()))
    )?.id ?? null;
  console.log(`✓ ${repCatRows.length} categorías legales REP`);

  // ── 3. Metas de cumplimiento por decreto ───────────────────────
  const goals: (typeof schema.complianceGoals.$inferInsert)[] = [];

  // NEU — Cat A (recolección + valorización) y Cat B (valorización)
  {
    const rows = sheetRows(wb, "🚗 NEU · Cumplimiento");
    const a = findRow(rows, "METAS LEGALES POR AÑO — CATEGORÍA A");
    for (let i = a + 2; s(rows[i]?.[0]); i++) {
      const y = regimeYear(rows[i][0]);
      goals.push(
        { priorityProductId: pp.neumaticos, repCategoryId: repCatId(pp.neumaticos, "A"), goalType: "recoleccion", regimeYear: y, percentage: pct(rows[i][1]).toFixed(2), legalRef: "D.S. 8/2019 art. 20" },
        { priorityProductId: pp.neumaticos, repCategoryId: repCatId(pp.neumaticos, "A"), goalType: "valorizacion", regimeYear: y, percentage: pct(rows[i][2]).toFixed(2), legalRef: "D.S. 8/2019 art. 20" }
      );
    }
    const b = findRow(rows, "METAS LEGALES — CATEGORÍA B");
    for (let i = b + 2; s(rows[i]?.[0]); i++) {
      goals.push({ priorityProductId: pp.neumaticos, repCategoryId: repCatId(pp.neumaticos, "B"), goalType: "valorizacion", regimeYear: regimeYear(rows[i][0]), percentage: pct(rows[i][1]).toFixed(2), legalRef: "D.S. 8/2019 art. 21" });
    }
  }
  // ENV — matriz DOM (5 subcategorías) y NO DOM (3)
  {
    const rows = sheetRows(wb, "📦 ENV · Cumplimiento");
    const domSubs = [
      ["Cartón para líquidos", 1], ["Metal", 2], ["Papel y cartón", 3], ["Plástico", 4], ["Vidrio", 5],
    ] as const;
    const d = findRow(rows, "METAS DOM");
    for (let i = d + 2; s(rows[i]?.[0]); i++) {
      const y = regimeYear(rows[i][0]);
      for (const [sub, col] of domSubs) {
        goals.push({ priorityProductId: pp.envases_embalajes, repCategoryId: repCatId(pp.envases_embalajes, "DOM (", sub), goalType: "valorizacion", regimeYear: y, percentage: pct(rows[i][col]).toFixed(2), legalRef: "D.S. 12/2020 art. 21 (DOM)" });
      }
    }
    const ndSubs = [["Metal", 1], ["Papel y cartón", 2], ["Plástico", 3]] as const;
    const nd = findRow(rows, "METAS NO DOM");
    for (let i = nd + 2; s(rows[i]?.[0]); i++) {
      const y = regimeYear(rows[i][0]);
      for (const [sub, col] of ndSubs) {
        goals.push({ priorityProductId: pp.envases_embalajes, repCategoryId: repCatId(pp.envases_embalajes, "NO DOM", sub), goalType: "valorizacion", regimeYear: y, percentage: pct(rows[i][col]).toFixed(2), legalRef: "D.S. 12/2020 art. 23 (NO DOM)" });
      }
    }
  }
  // ALU — metas anuales (fracciones) con año calendario
  {
    const rows = sheetRows(wb, "🛢️ ALU · Cumplimiento");
    const m = findRow(rows, "METAS ANUALES");
    for (let i = m + 2; s(rows[i]?.[0]); i++) {
      const cal = Math.round(parseDecimal(s(rows[i][4]).replace(/[≥\s]/g, ""))) || null;
      goals.push({ priorityProductId: pp.aceites_lubricantes, repCategoryId: repCatId(pp.aceites_lubricantes, "Recuperable"), goalType: "valorizacion", regimeYear: regimeYear(rows[i][0]), calendarYear: cal, percentage: pct(rows[i][1]).toFixed(2), legalRef: "D.S. 47/2023 art. 17" });
    }
  }
  // P+RAEE — meta general + específicas AIT/PFV
  {
    const rows = sheetRows(wb, "🔋 P+RAEE · Cumplimiento");
    const m = findRow(rows, "METAS ANUALES");
    for (let i = m + 2; s(rows[i]?.[0]); i++) {
      const y = regimeYear(rows[i][0]);
      const cal = Math.round(parseDecimal(s(rows[i][4]).replace(/[≥\s]/g, ""))) || null;
      const gen = s(rows[i][1]);
      const ait = s(rows[i][2]);
      const pfv = s(rows[i][3]);
      if (gen && gen !== "—")
        goals.push({ priorityProductId: pp.pilas_aee, repCategoryId: null, goalType: "general", regimeYear: y, calendarYear: cal, percentage: pct(gen).toFixed(2), legalRef: "D.S. 22/2025 — meta general (excl. PFV)" });
      if (ait && ait !== "—")
        goals.push({ priorityProductId: pp.pilas_aee, repCategoryId: repCatId(pp.pilas_aee, "AIT"), goalType: "especifica", regimeYear: y, calendarYear: cal, percentage: pct(ait).toFixed(2), legalRef: "D.S. 22/2025 — específica AIT" });
      if (pfv && pfv !== "—")
        goals.push({ priorityProductId: pp.pilas_aee, repCategoryId: repCatId(pp.pilas_aee, "PFV"), goalType: "especifica", regimeYear: y, calendarYear: cal, percentage: pct(pfv).toFixed(2), legalRef: "D.S. 22/2025 — específica PFV" });
    }
  }
  await db.insert(schema.complianceGoals).values(goals);
  console.log(`✓ ${goals.length} metas de cumplimiento`);

  // ── 4. Sistemas de Gestión ─────────────────────────────────────
  const sigDefs = [
    { name: "ReSimple", priorityProduct: "Envases y Embalajes", ppCode: "envases_embalajes", hasDomiciliary: true, hasNonDomiciliary: true },
    { name: "Giro", priorityProduct: "Envases y Embalajes", ppCode: "envases_embalajes", hasDomiciliary: true, hasNonDomiciliary: true },
    { name: "ProREP", priorityProduct: "Envases y Embalajes", ppCode: "envases_embalajes", hasDomiciliary: false, hasNonDomiciliary: true },
    { name: "NEUVOL", priorityProduct: "Neumáticos", ppCode: "neumaticos", hasDomiciliary: false, hasNonDomiciliary: false },
    { name: "VALORA+", priorityProduct: "Neumáticos", ppCode: "neumaticos", hasDomiciliary: false, hasNonDomiciliary: false },
    { name: "SIGRA", priorityProduct: "Aceites Lubricantes", ppCode: "aceites_lubricantes", hasDomiciliary: false, hasNonDomiciliary: false },
    { name: "Individual", priorityProduct: "Sistema individual (art. 19 Ley 20.920)", ppCode: null as string | null, hasDomiciliary: false, hasNonDomiciliary: false },
  ];
  const sigRows = await db
    .insert(schema.managementSystems)
    .values(sigDefs.map(({ ppCode, ...d }) => ({ ...d, priorityProductId: ppCode ? pp[ppCode] : null })))
    .returning();
  const sig = Object.fromEntries(sigRows.map((r) => [r.name.toUpperCase(), r.id]));
  console.log(`✓ ${sigRows.length} sistemas de gestión`);

  // ── 5. Tarifas 2026 ReSimple y Giro (Plataforma REP_Línea Base) ─
  const wbTar = XLSX.readFile(LINEA_BASE);
  let tariffCount = 0;
  for (const [sheetName, sigName] of [
    ["Tarifas ReSimple", "ReSimple"],
    ["Tarifas Giro", "Giro"],
  ] as const) {
    const rows = sheetRows(wbTar, sheetName)
      .slice(2)
      .filter((r) => r[0] && r[4] !== undefined && r[4] !== null && s(r[4]) !== "");
    const unique = new Map<string, Row>();
    for (const r of rows) {
      const key = s(r[5]) || `${s(r[0])}|${s(r[2])}|${s(r[3])}`;
      if (!unique.has(key)) unique.set(key, r);
    }
    for (const [key, r] of unique) {
      const [cat] = await db
        .insert(schema.tariffCategories)
        .values({
          systemId: sig[sigName.toUpperCase()],
          segment: s(r[0]),
          material: s(r[1]),
          subcategory: s(r[2]),
          tariffType: s(r[3]) || "Normal",
          lookupKey: key,
        })
        .returning();
      await db.insert(schema.tariffs).values({
        categoryId: cat.id,
        year: 2026,
        rateUfPerTon: parseDecimal(r[4]).toFixed(4),
        rateValue: parseDecimal(r[4]).toFixed(4),
        rateUnit: "UF/ton",
        source: `${sheetName} — Plataforma REP_Línea Base.xlsx`,
      });
      tariffCount++;
    }
    console.log(`✓ Tarifas ${sigName} 2026 cargadas`);
  }

  // ── 5b. Tarifas obtenidas de sitios oficiales (13-jul-2026) ────
  // ProREP: UF/ton por categoría (prorep.cl/tarifas)
  {
    const PROREP: Record<string, Record<number, number>> = {
      "Papel y Cartón": { 2023: 0.07, 2024: 0.17, 2025: 0.17, 2026: 0.2 },
      Metales: { 2023: 0.17, 2024: 0.19, 2025: 0.21, 2026: 0.31 },
      Plásticos: { 2023: 0.26, 2024: 0.26, 2025: 0.27, 2026: 0.28 },
      "No reciclables": { 2023: 0.44, 2024: 0.54, 2025: 0.64, 2026: 0.78 },
    };
    for (const [material, byYear] of Object.entries(PROREP)) {
      const [cat] = await db
        .insert(schema.tariffCategories)
        .values({
          systemId: sig["PROREP"],
          segment: "Domiciliario",
          material,
          subcategory: material,
          tariffType: "Normal",
          lookupKey: `Domiciliario|${material}|Normal`,
        })
        .returning();
      for (const [year, rate] of Object.entries(byYear)) {
        await db.insert(schema.tariffs).values({
          categoryId: cat.id,
          year: Number(year),
          rateUfPerTon: rate.toFixed(4),
          rateValue: rate.toFixed(4),
          rateUnit: "UF/ton",
          source: "https://prorep.cl/tarifas/ (obtenido 13-07-2026)",
        });
        tariffCount++;
      }
    }
    console.log("✓ Tarifas ProREP 2023-2026 cargadas");
  }
  // Neumáticos: precio único CLP/kg + IVA (neuvol.cl / valoramas.cl)
  {
    const NEU_TARIFFS: { sigName: string; url: string; byYear: Record<number, number> }[] = [
      { sigName: "NEUVOL", url: "https://neuvol.cl/", byYear: { 2025: 249.5, 2026: 262.5 } },
      { sigName: "VALORA+", url: "https://valoramas.cl/tarifas/", byYear: { 2024: 254, 2025: 254, 2026: 264 } },
    ];
    for (const t of NEU_TARIFFS) {
      const [cat] = await db
        .insert(schema.tariffCategories)
        .values({
          systemId: sig[t.sigName],
          segment: "Único",
          material: "Neumáticos",
          subcategory: "Tarifa única por kilo",
          tariffType: "Normal",
          lookupKey: `Único|Neumáticos|Normal`,
        })
        .returning();
      for (const [year, rate] of Object.entries(t.byYear)) {
        await db.insert(schema.tariffs).values({
          categoryId: cat.id,
          year: Number(year),
          rateUfPerTon: "0",
          rateValue: rate.toFixed(4),
          rateUnit: "CLP/kg",
          plusIva: true,
          source: `${t.url} (obtenido 13-07-2026)`,
        });
        tariffCount++;
      }
    }
    console.log("✓ Tarifas NEUVOL y VALORA+ (CLP/kg) cargadas");
  }

  // SIG por productor de envases (hoja ENV · Cumplimiento, bloque seguimiento)
  const envSigByProducer = new Map<string, string>();
  {
    const rows = sheetRows(wb, "📦 ENV · Cumplimiento");
    const h = findRow(rows, "SEGUIMIENTO");
    for (let i = h + 2; s(rows[i]?.[0]); i++) {
      const producer = s(rows[i][1]);
      const sigName = s(rows[i][9]);
      if (producer && sigName && !envSigByProducer.has(producer))
        envSigByProducer.set(producer, sigName);
    }
  }

  // ── 6. Catálogos + Líneas Base por producto prioritario ────────
  const sheets = [
    {
      ppCode: "neumaticos", cat: "🚗 NEU · Catálogo", lb: "🚗 NEU · Línea Base",
      catCols: { sku: 0, name: 1, brand: 2, code: 3, sub: 4, weight: 10, weightUnit: "kg", sigCol: 12 as number | null },
      lbCols: { year: 0, month: 1, sku: 2, prod: 4, rut: 5, units: 9, unit: "unidades", sigCol: null as number | null },
      materialClass: "Neumático",
      extras: (r: Row) => ({ aro: s(r[6]), medida: s(r[7]), tipoVehiculo: s(r[8]), macizo: s(r[9]), estado: s(r[13]) }),
    },
    {
      ppCode: "envases_embalajes", cat: "📦 ENV · Catálogo", lb: "📦 ENV · Línea Base",
      catCols: { sku: 0, name: 1, brand: 2, code: 3, sub: 4, weight: 9, weightUnit: "g", sigCol: null as number | null },
      lbCols: { year: 0, month: 1, sku: 2, prod: 4, rut: 5, units: 9, unit: "unidades", sigCol: 12 as number | null },
      materialClass: "Envase",
      extras: (r: Row) => ({ materialPrincipal: s(r[5]), tipoEnvase: s(r[6]), retornable: s(r[7]), peligroso: s(r[8]), pctReciclado: s(r[11]), facilidadRecoleccion: s(r[12]) }),
    },
    {
      ppCode: "raee", cat: "⚡ RAEE · Catálogo", lb: "⚡ RAEE · Línea Base",
      catCols: { sku: 0, name: 1, brand: 2, code: 3, sub: 4, weight: 10, weightUnit: "kg", sigCol: null as number | null },
      lbCols: { year: 0, month: 1, sku: 2, prod: 4, rut: 5, units: 9, unit: "unidades", sigCol: null as number | null },
      materialClass: "AEE",
      extras: (r: Row) => ({ criterio: s(r[5]), alto: s(r[6]), ancho: s(r[7]), prof: s(r[8]), dimMayor: s(r[9]), llevaPila: s(r[12]) }),
    },
    {
      ppCode: "aceites_lubricantes", cat: "🛢️ ALU · Catálogo", lb: "🛢️ ALU · Línea Base",
      catCols: { sku: 0, name: 1, brand: 2, code: 3, sub: -1, weight: 8, weightUnit: "L", sigCol: null as number | null },
      lbCols: { year: 0, month: 1, sku: 2, prod: 4, rut: 5, units: 7, unit: "litros", sigCol: null as number | null },
      materialClass: "Aceite Lubricante",
      extras: (r: Row) => ({ tipoAceite: s(r[5]), aplicacion: s(r[6]), densidad: s(r[7]), exento: s(r[9]) }),
    },
    {
      ppCode: "pilas_aee", cat: "🔋 P+RAEE · Catálogo", lb: "🔋 P+RAEE · Línea Base",
      catCols: { sku: 0, name: 1, brand: 2, code: 3, sub: -1, weight: 7, weightUnit: "kg", sigCol: null as number | null },
      lbCols: { year: 0, month: 1, sku: 2, prod: 4, rut: 5, units: 9, unit: "unidades", sigCol: null as number | null },
      materialClass: "Pilas y AEE",
      extras: (r: Row) => ({ descripcion: s(r[4]), tipo: s(r[5]), aplicacion: s(r[6]), dimMayor: s(r[8]), llevaPila: s(r[9]), pesoPila: s(r[10]) }),
    },
  ];

  /** productType legacy (enum) por código de producto prioritario */
  const legacyType: Record<string, (typeof schema.productTypeEnum.enumValues)[number]> = {
    neumaticos: "neumaticos", envases_embalajes: "envases_embalajes", raee: "raee",
    aceites_lubricantes: "aceites_lubricantes", pilas_aee: "pilas",
  };

  const orgByRut = new Map<string, string>();
  let prodCount = 0, salesCount = 0, orgPpLinks = 0;

  for (const cfg of sheets) {
    const ppId = pp[cfg.ppCode];
    const catRows = dataRows(sheetRows(wb, cfg.cat));
    const lbRows = dataRows(sheetRows(wb, cfg.lb));

    // Productor por SKU (desde la línea base) → organización
    const orgOfSku = new Map<string, { name: string; rut: string; sig: string }>();
    for (const r of lbRows) {
      const sku = s(r[cfg.lbCols.sku]);
      if (!sku || orgOfSku.has(sku)) continue;
      const producerName = s(r[cfg.lbCols.prod]);
      // SIG: línea base → hoja cumplimiento → default ReSimple (solo envases;
      // supuesto provisional a validar con el cliente)
      let sigName = cfg.lbCols.sigCol !== null ? s(r[cfg.lbCols.sigCol]) : "";
      if (!sigName && cfg.ppCode === "envases_embalajes")
        sigName = envSigByProducer.get(producerName) ?? "ReSimple";
      orgOfSku.set(sku, {
        name: producerName,
        rut: s(r[cfg.lbCols.rut]),
        sig: sigName,
      });
    }

    const orgPpDone = new Set<string>();
    const productIdBySku = new Map<string, string>();

    for (const r of catRows) {
      const sku = s(r[cfg.catCols.sku]);
      if (!sku) continue;
      const info = orgOfSku.get(sku) ?? [...orgOfSku.values()][0];
      if (!info || !info.rut) continue;

      // Organización (una por productor/RUT)
      let orgId = orgByRut.get(info.rut);
      if (!orgId) {
        const [org] = await db
          .insert(schema.organizations)
          .values({ name: info.name, rut: info.rut })
          .returning();
        orgId = org.id;
        orgByRut.set(info.rut, orgId);
      }

      // Vínculo organización ↔ producto prioritario (+ SIG activo si se conoce)
      const linkKey = `${orgId}|${ppId}`;
      if (!orgPpDone.has(linkKey)) {
        const sigName =
          (cfg.catCols.sigCol !== null ? s(r[cfg.catCols.sigCol]) : "") || info.sig;
        await db
          .insert(schema.organizationPriorityProducts)
          .values({
            organizationId: orgId,
            priorityProductId: ppId,
            activeSystemId: sig[sigName.toUpperCase()] ?? null,
          })
          .onConflictDoNothing();
        orgPpDone.add(linkKey);
        orgPpLinks++;
      }

      const code = s(r[cfg.catCols.code]);
      const sub = cfg.catCols.sub >= 0 ? s(r[cfg.catCols.sub]) : "";
      const weight = parseDecimal(r[cfg.catCols.weight]);

      const [product] = await db
        .insert(schema.products)
        .values({
          organizationId: orgId,
          sku,
          name: s(r[cfg.catCols.name]),
          brand: s(r[cfg.catCols.brand]),
          category: code,
          subcategory: sub,
          productType: legacyType[cfg.ppCode],
          priorityProductId: ppId,
          customData: cfg.extras(r),
        })
        .returning();
      productIdBySku.set(sku, product.id);

      // Pieza única con peso en unidad nativa (g equivalentes para legacy)
      const grams =
        cfg.catCols.weightUnit === "g" ? weight : weight * 1000; // kg y L → ×1000 (L ajusta por densidad en el cálculo)
      // Etiqueta corta de material para gráficos/drill-down (nomenclatura red)
      const shortCode = code.split("—")[0].trim();
      const materialClass =
        cfg.ppCode === "envases_embalajes" ? (sub || "Otros")
        : cfg.ppCode === "neumaticos" ? `Cat. ${shortCode}`
        : cfg.ppCode === "raee" ? shortCode
        : cfg.ppCode === "pilas_aee" ? shortCode
        : cfg.materialClass; // aceites
      await db.insert(schema.productPieces).values({
        productId: product.id,
        pieceName: "Unidad",
        packagingType: "primary",
        isDomiciliary: code === "DOM",
        materialClass,
        materialDetail: sub || shortCode || cfg.materialClass,
        weightGrams: grams,
        weightValue: weight,
        weightUnit: cfg.catCols.weightUnit,
        repCategoryId: repCatId(ppId, code, cfg.ppCode === "envases_embalajes" ? sub : ""),
        wasteType: "recyclable",
      });
      prodCount++;
    }

    // Ventas mensuales desde la línea base
    for (const r of lbRows) {
      const sku = s(r[cfg.lbCols.sku]);
      const productId = productIdBySku.get(sku);
      if (!productId) continue;
      const units = Math.round(parseDecimal(r[cfg.lbCols.units]));
      if (units <= 0) continue;
      await db
        .insert(schema.salesRecords)
        .values({
          productId,
          year: Math.round(parseDecimal(r[cfg.lbCols.year])) || 2026,
          month: month(r[cfg.lbCols.month]),
          unitsSold: units,
          unit: cfg.lbCols.unit,
        })
        .onConflictDoNothing();
      salesCount++;
    }
    console.log(`✓ ${cfg.ppCode}: catálogo + línea base`);
  }

  // ── 6b. Mapeos de tarifa POR DEFECTO para Envases ──────────────
  // Homologación inicial: subcategoría REP → categoría del SIG activo.
  // isManual=false los marca como propuesta automática (validar con cliente
  // en la sábana de homologación).
  const MATERIAL_TO_TARIFF: Record<string, string[]> = {
    "plástico": ["plásticos"],
    "metal": ["metales"],
    "papel y cartón": ["papel y cartón"],
    "cartón para líquidos": ["cpl", "cartón para líquidos", "cartón para bebidas"],
    "vidrio": ["vidrio"],
    "otros": ["otros"],
  };
  let mappingCount = 0;
  {
    const envLinks = await db.query.organizationPriorityProducts.findMany({
      where: (l, { eq, and, isNotNull }) =>
        and(
          eq(l.priorityProductId, pp.envases_embalajes),
          isNotNull(l.activeSystemId)
        ),
    });
    const allCats = await db.query.tariffCategories.findMany();
    for (const link of envLinks) {
      const pieces = await db
        .selectDistinct({
          materialDetail: schema.productPieces.materialDetail,
          isDomiciliary: schema.productPieces.isDomiciliary,
        })
        .from(schema.productPieces)
        .innerJoin(
          schema.products,
          eqOp(schema.productPieces.productId, schema.products.id)
        )
        .where(
          andOp(
            eqOp(schema.products.organizationId, link.organizationId),
            eqOp(schema.products.priorityProductId, pp.envases_embalajes)
          )
        );
      for (const piece of pieces) {
        const segment = piece.isDomiciliary ? "Domiciliario" : "No Domiciliario";
        const targets =
          MATERIAL_TO_TARIFF[piece.materialDetail.toLowerCase()] ??
          [piece.materialDetail.toLowerCase()];
        const candidates = allCats.filter(
          (c) =>
            c.systemId === link.activeSystemId &&
            c.segment === segment &&
            targets.some((t) => c.material.toLowerCase().startsWith(t))
        );
        if (!candidates.length) continue;
        const cat =
          candidates.find((c) => c.subcategory.toLowerCase().includes("otros")) ??
          candidates[0];
        await db
          .insert(schema.tariffMappings)
          .values({
            organizationId: link.organizationId,
            systemId: link.activeSystemId!,
            materialDetail: piece.materialDetail,
            segment,
            hasGrease: false,
            isHazardous: false,
            tariffCategoryId: cat.id,
            isManual: false,
          })
          .onConflictDoNothing();
        mappingCount++;
      }
    }
    console.log(
      `✓ ${mappingCount} mapeos de tarifa por defecto ENV (homologación inicial)`
    );
  }

  // ── Resumen ────────────────────────────────────────────────────
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`✅ Seed definitivo completado:`);
  console.log(`   • ${ppRows.length} productos prioritarios`);
  console.log(`   • ${repCatRows.length} categorías legales REP`);
  console.log(`   • ${goals.length} metas de cumplimiento`);
  console.log(`   • ${sigRows.length} sistemas de gestión`);
  console.log(
    `   • ${tariffCount} tarifas (ReSimple, Giro, ProREP, NEUVOL, VALORA+)`
  );
  console.log(`   • ${orgByRut.size} organizaciones (productores)`);
  console.log(`   • ${orgPpLinks} vínculos org ↔ producto prioritario`);
  console.log(`   • ${prodCount} productos (SKUs) con su pieza`);
  console.log(`   • ${salesCount} registros de venta mensuales`);
  console.log(`   • ${mappingCount} mapeos de tarifa por defecto (ENV)`);
  console.log(`═══════════════════════════════════════════`);
  await sql.end();
}

main().catch(async (e) => {
  console.error("❌ Error en seed:", e);
  await sql.end();
  process.exit(1);
});
