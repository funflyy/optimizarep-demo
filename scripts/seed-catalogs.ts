/**
 * Seed de catálogos base — productos prioritarios, sistemas de gestión y las
 * tarifas publicadas en sitios oficiales.
 *
 * Es el subconjunto de `src/server/db/seed.ts` que NO depende de los Excel
 * externos (MAESTRA BBDD REP_VF2.0.xlsx / Plataforma REP_Línea Base.xlsx), así
 * que se puede ejecutar en cualquier equipo. A diferencia de db:seed, NO vacía
 * ninguna tabla: es idempotente y se puede correr sobre datos existentes.
 *
 * NO incluye (requiere la MAESTRA, no se inventan):
 *   - rep_categories   → taxonomías legales de los 5 productos prioritarios
 *   - compliance_goals → metas por decreto
 *   - tarifas ReSimple y Giro 2026 (vienen de Plataforma REP_Línea Base.xlsx)
 *
 * Uso: pnpm tsx scripts/seed-catalogs.ts
 */
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import * as schema from "../src/server/db/schema";

loadEnvConfig(process.cwd());

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL (revisar .env.local)");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(sql, { schema });

// ── Productos prioritarios ───────────────────────────────────────
const PRIORITY_PRODUCTS = [
  {
    code: "neumaticos",
    name: "Neumáticos",
    decree: "D.S. 8/2019",
    legalBasis:
      "Metas arts. 20-21; factores de desgaste Cat.A 0,84 / Cat.B 0,75 (art. 24)",
    nativeUnit: "kg",
    goalsEffectiveFrom: 2023,
    sortOrder: 1,
  },
  {
    code: "envases_embalajes",
    name: "Envases y Embalajes",
    decree: "D.S. 12/2020",
    legalBasis:
      "Metas DOM (art. 21) y NO DOM (art. 23) por subcategoría; exención <300 kg/año o microempresa",
    nativeUnit: "g",
    goalsEffectiveFrom: 2023,
    sortOrder: 2,
  },
  {
    code: "raee",
    name: "Aparatos Eléctricos y Electrónicos (RAEE)",
    decree: "Guía MMA / Ley 20.920",
    legalBasis:
      "6 categorías según guía MMA; declaración RETC en Ventanilla Única",
    nativeUnit: "kg",
    goalsEffectiveFrom: null as number | null,
    sortOrder: 3,
  },
  {
    code: "aceites_lubricantes",
    name: "Aceites Lubricantes",
    decree: "D.S. 47/2023",
    legalBasis:
      "Solo recuperables sujetos a metas (50%→90%); exención ≤66 L/año; litros × densidad",
    nativeUnit: "L",
    goalsEffectiveFrom: 2027,
    sortOrder: 4,
  },
  {
    code: "pilas_aee",
    name: "Pilas y AEE (D.S. 22)",
    decree: "D.S. 22/2025",
    legalBasis:
      "AIT / PFV / Otros AEE / Pila; meta general + específicas; base promedio 3 años",
    nativeUnit: "kg",
    goalsEffectiveFrom: 2028,
    sortOrder: 5,
  },
];

// ── Sistemas de gestión ──────────────────────────────────────────
const SYSTEMS = [
  { name: "ReSimple", priorityProduct: "Envases y Embalajes", ppCode: "envases_embalajes", hasDomiciliary: true, hasNonDomiciliary: true },
  { name: "Giro", priorityProduct: "Envases y Embalajes", ppCode: "envases_embalajes", hasDomiciliary: true, hasNonDomiciliary: true },
  { name: "ProREP", priorityProduct: "Envases y Embalajes", ppCode: "envases_embalajes", hasDomiciliary: false, hasNonDomiciliary: true },
  { name: "NEUVOL", priorityProduct: "Neumáticos", ppCode: "neumaticos", hasDomiciliary: false, hasNonDomiciliary: false },
  { name: "VALORA+", priorityProduct: "Neumáticos", ppCode: "neumaticos", hasDomiciliary: false, hasNonDomiciliary: false },
  { name: "SIGRA", priorityProduct: "Aceites Lubricantes", ppCode: "aceites_lubricantes", hasDomiciliary: false, hasNonDomiciliary: false },
  { name: "Individual", priorityProduct: "Sistema individual (art. 19 Ley 20.920)", ppCode: null as string | null, hasDomiciliary: false, hasNonDomiciliary: false },
];

/** ProREP — UF/ton por categoría (prorep.cl/tarifas, obtenido 13-07-2026) */
const PROREP: Record<string, Record<number, number>> = {
  "Papel y Cartón": { 2023: 0.07, 2024: 0.17, 2025: 0.17, 2026: 0.2 },
  Metales: { 2023: 0.17, 2024: 0.19, 2025: 0.21, 2026: 0.31 },
  Plásticos: { 2023: 0.26, 2024: 0.26, 2025: 0.27, 2026: 0.28 },
  "No reciclables": { 2023: 0.44, 2024: 0.54, 2025: 0.64, 2026: 0.78 },
};

/** Neumáticos — precio único CLP/kg + IVA */
const NEU_TARIFFS = [
  { sigName: "NEUVOL", url: "https://neuvol.cl/", byYear: { 2025: 249.5, 2026: 262.5 } },
  { sigName: "VALORA+", url: "https://valoramas.cl/tarifas/", byYear: { 2024: 254, 2025: 254, 2026: 264 } },
];

async function main() {
  console.log("Seed de catálogos base (idempotente, no vacía tablas)\n");

  // ── 1. Productos prioritarios ─────────────────────────────────
  for (const pp of PRIORITY_PRODUCTS) {
    await db
      .insert(schema.priorityProducts)
      .values(pp)
      .onConflictDoUpdate({
        target: schema.priorityProducts.code,
        set: {
          name: pp.name,
          decree: pp.decree,
          legalBasis: pp.legalBasis,
          nativeUnit: pp.nativeUnit,
          goalsEffectiveFrom: pp.goalsEffectiveFrom,
          sortOrder: pp.sortOrder,
        },
      });
  }
  const ppRows = await db.select().from(schema.priorityProducts);
  const ppByCode = Object.fromEntries(ppRows.map((r) => [r.code, r.id]));
  console.log(`✓ ${ppRows.length} productos prioritarios`);

  // ── 2. Sistemas de gestión ────────────────────────────────────
  for (const { ppCode, ...s } of SYSTEMS) {
    await db
      .insert(schema.managementSystems)
      .values({ ...s, priorityProductId: ppCode ? ppByCode[ppCode] : null })
      .onConflictDoUpdate({
        target: schema.managementSystems.name,
        set: {
          priorityProduct: s.priorityProduct,
          priorityProductId: ppCode ? ppByCode[ppCode] : null,
          hasDomiciliary: s.hasDomiciliary,
          hasNonDomiciliary: s.hasNonDomiciliary,
        },
      });
  }
  const sigRows = await db.select().from(schema.managementSystems);
  const sigByName = Object.fromEntries(
    sigRows.map((r) => [r.name.toUpperCase(), r.id])
  );
  console.log(`✓ ${sigRows.length} sistemas de gestión`);

  // ── 3. Tarifas ────────────────────────────────────────────────
  /**
   * Crea la categoría si no existe y devuelve su id.
   *
   * La búsqueda va por (systemId, lookupKey), que es el índice único real.
   * Buscar solo por lookupKey mezcla SIG distintos: NEUVOL y VALORA+ usan la
   * misma clave "Único|Neumáticos|Normal".
   */
  async function ensureCategory(v: typeof schema.tariffCategories.$inferInsert) {
    const existing = await db
      .select({ id: schema.tariffCategories.id })
      .from(schema.tariffCategories)
      .where(
        and(
          eq(schema.tariffCategories.systemId, v.systemId),
          eq(schema.tariffCategories.lookupKey, v.lookupKey)
        )
      )
      .limit(1);
    const hit = existing.find(() => true);
    if (hit) return hit.id;
    const [row] = await db
      .insert(schema.tariffCategories)
      .values(v)
      .returning({ id: schema.tariffCategories.id });
    return row.id;
  }

  let tariffCount = 0;

  // ProREP (UF/ton)
  for (const [material, byYear] of Object.entries(PROREP)) {
    const categoryId = await ensureCategory({
      systemId: sigByName["PROREP"],
      segment: "Domiciliario",
      material,
      subcategory: material,
      tariffType: "Normal",
      lookupKey: `Domiciliario|${material}|Normal`,
    });
    for (const [year, rate] of Object.entries(byYear)) {
      await db
        .insert(schema.tariffs)
        .values({
          categoryId,
          year: Number(year),
          rateUfPerTon: rate.toFixed(4),
          rateValue: rate.toFixed(4),
          rateUnit: "UF/ton",
          source: "https://prorep.cl/tarifas/ (obtenido 13-07-2026)",
        })
        .onConflictDoNothing();
      tariffCount++;
    }
  }
  console.log("✓ tarifas ProREP 2023-2026");

  // Neumáticos (CLP/kg + IVA)
  for (const t of NEU_TARIFFS) {
    const categoryId = await ensureCategory({
      systemId: sigByName[t.sigName],
      segment: "Único",
      material: "Neumáticos",
      subcategory: "Tarifa única por kilo",
      tariffType: "Normal",
      lookupKey: "Único|Neumáticos|Normal",
    });
    for (const [year, rate] of Object.entries(t.byYear)) {
      await db
        .insert(schema.tariffs)
        .values({
          categoryId,
          year: Number(year),
          rateUfPerTon: "0",
          rateValue: rate.toFixed(4),
          rateUnit: "CLP/kg",
          plusIva: true,
          source: `${t.url} (obtenido 13-07-2026)`,
        })
        .onConflictDoNothing();
      tariffCount++;
    }
  }
  console.log(`✓ tarifas NEUVOL y VALORA+ (${tariffCount} tarifas en total)`);

  // ── Resumen ───────────────────────────────────────────────────
  const counts: Record<string, number> = {};
  for (const t of [
    "priority_products",
    "management_systems",
    "tariff_categories",
    "tariffs",
    "rep_categories",
    "compliance_goals",
  ]) {
    const [r] = await sql.unsafe(`SELECT count(*)::int AS c FROM ${t}`);
    counts[t] = r.c as number;
  }

  console.log("\n=== ESTADO ===");
  for (const [t, c] of Object.entries(counts)) {
    console.log(`  ${t.padEnd(20)}: ${c}`);
  }

  if (counts.rep_categories === 0 || counts.compliance_goals === 0) {
    console.log(
      "\nFALTA (requiere MAESTRA BBDD REP_VF2.0.xlsx, no se inventa):\n" +
        "  - rep_categories   → taxonomías legales de los productos prioritarios\n" +
        "  - compliance_goals → metas por decreto\n" +
        "  - tarifas ReSimple y Giro (Plataforma REP_Línea Base.xlsx)\n" +
        "Con esos archivos en su ruta, `pnpm db:seed` los carga."
    );
  }
}

main()
  .then(async () => {
    await sql.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await sql.end();
    process.exit(1);
  });
