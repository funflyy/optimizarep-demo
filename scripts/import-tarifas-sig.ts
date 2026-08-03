/**
 * Importa las tarifas de ReSimple y Giro desde "Plataforma REP_Línea Base.xlsx".
 *
 * Estructura de cada hoja de tarifas:
 *   fila 0 → "Año 2026"
 *   fila 1 → Segmento | Material | Subcategoría | Tipo Tarifa | UF/Ton | Auxiliar
 *   fila 2+ → datos
 *
 * CLAVE DE LOOKUP — se agrega `Material`:
 *   La columna `Auxiliar` del Excel usa "Segmento|Subcategoría|TipoTarifa", pero
 *   esa clave NO es única en ReSimple: 39 filas la repiten porque el Material
 *   distingue "Plásticos Flexibles" de "Plásticos Rígidos". En 3 casos los UF
 *   difieren de verdad, así que un BUSCARV con la clave de 3 partes cobra la
 *   tarifa equivocada:
 *
 *     Domiciliario|PEBD sin grasa|Normal      flexible 2,95  vs  rígido 4,18
 *     Domiciliario|PP sin grasa|Normal        flexible 2,95  vs  rígido 4,18
 *     No Domiciliario|PEBD sin grasa|Normal   flexible 0,21  vs  rígido 0,27
 *
 *   Con Material en la clave no queda ningún duplicado.
 *
 * Idempotente: hace upsert por (sistema, lookupKey) y por (categoría, año).
 *
 * Uso: pnpm tsx scripts/import-tarifas-sig.ts [ruta/al/archivo.xlsx]
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
  "Plataforma REP_Línea Base.xlsx"
);

/**
 * Hoja del Excel → nombre del sistema de gestión en la BD.
 * `management_systems` se identifica por `name` (único); no tiene columna code.
 */
const SHEETS: Record<string, string> = {
  "Tarifas ReSimple": "ReSimple",
  "Tarifas Giro": "Giro",
};

interface TariffRow {
  segment: string;
  material: string;
  subcategory: string;
  tariffType: string;
  ufPerTon: number;
}

/** "Año 2026" → 2026 */
function parseYear(cell: unknown): number | undefined {
  const m = String(cell ?? "").match(/(\d{4})/);
  return m ? Number(m[1]) : undefined;
}

function readSheet(
  ws: XLSX.WorkSheet,
  sheetName: string
): { year: number; rows: TariffRow[] } {
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    blankrows: false,
  });

  const year = parseYear(raw[0]?.[0]);
  if (!year) {
    throw new Error(
      `Hoja "${sheetName}": no se pudo leer el año de la primera fila (${JSON.stringify(raw[0]?.[0])})`
    );
  }

  const rows: TariffRow[] = [];
  for (const r of raw.slice(2)) {
    const segment = String(r[0] ?? "").trim();
    const uf = Number(r[4]);
    // Fila de datos = tiene segmento y un UF numérico (0 es válido)
    if (!segment || !Number.isFinite(uf)) continue;
    rows.push({
      segment,
      material: String(r[1] ?? "").trim(),
      subcategory: String(r[2] ?? "").trim(),
      tariffType: String(r[3] ?? "").trim(),
      ufPerTon: uf,
    });
  }
  return { year, rows };
}

async function main() {
  const path = process.argv[2] ?? DEFAULT_PATH;
  if (!existsSync(path)) {
    console.error(`No existe el archivo: ${path}`);
    console.error(`Uso: pnpm tsx scripts/import-tarifas-sig.ts [ruta.xlsx]`);
    process.exit(1);
  }

  const sql = postgres(DATABASE_URL!, { max: 1 });
  const db = drizzle(sql, { schema });

  console.log(`Leyendo ${path}\n`);
  const wb = XLSX.read(readFileSync(path), { type: "buffer" });

  let totalCats = 0;
  let totalTariffs = 0;

  for (const [sheetName, systemName] of Object.entries(SHEETS)) {
    const ws = wb.Sheets[sheetName];
    if (!ws) {
      console.log(`⚠ hoja "${sheetName}" no encontrada, se omite`);
      continue;
    }

    const system = await db.query.managementSystems.findFirst({
      where: eq(schema.managementSystems.name, systemName),
    });
    if (!system) {
      console.log(
        `⚠ sistema "${systemName}" no está en la BD — correr antes: pnpm tsx scripts/seed-catalogs.ts`
      );
      continue;
    }

    const { year, rows } = readSheet(ws, sheetName);
    console.log(`── ${system.name} · año ${year} · ${rows.length} filas`);

    // Detectar y reportar colisiones antes de escribir
    const byShortKey = new Map<string, Set<number>>();
    for (const r of rows) {
      const k = `${r.segment}|${r.subcategory}|${r.tariffType}`;
      if (!byShortKey.has(k)) byShortKey.set(k, new Set());
      byShortKey.get(k)!.add(r.ufPerTon);
    }
    const ambiguous = [...byShortKey.entries()].filter(([, v]) => v.size > 1);
    if (ambiguous.length > 0) {
      console.log(
        `   ⚠ ${ambiguous.length} clave(s) de 3 partes con UF distinto; se usa Material para desambiguar:`
      );
      for (const [k, ufs] of ambiguous) {
        console.log(`     ${k} → ${[...ufs].join(" / ")} UF/ton`);
      }
    }

    let cats = 0;
    let tariffs = 0;

    for (const r of rows) {
      // Material va en la clave: sin él, ReSimple colisiona
      const lookupKey = `${r.segment}|${r.material}|${r.subcategory}|${r.tariffType}`;

      const [cat] = await db
        .insert(schema.tariffCategories)
        .values({
          systemId: system.id,
          segment: r.segment,
          material: r.material,
          subcategory: r.subcategory,
          tariffType: r.tariffType,
          lookupKey,
        })
        .onConflictDoUpdate({
          target: [
            schema.tariffCategories.systemId,
            schema.tariffCategories.lookupKey,
          ],
          set: {
            segment: r.segment,
            material: r.material,
            subcategory: r.subcategory,
            tariffType: r.tariffType,
          },
        })
        .returning();
      cats++;

      await db
        .insert(schema.tariffs)
        .values({
          categoryId: cat.id,
          year,
          rateUfPerTon: String(r.ufPerTon),
          rateValue: String(r.ufPerTon),
          rateUnit: "UF/ton",
          source: `Plataforma REP_Línea Base.xlsx · ${sheetName}`,
        })
        .onConflictDoUpdate({
          target: [schema.tariffs.categoryId, schema.tariffs.year],
          set: {
            rateUfPerTon: String(r.ufPerTon),
            rateValue: String(r.ufPerTon),
            source: `Plataforma REP_Línea Base.xlsx · ${sheetName}`,
          },
        });
      tariffs++;
    }

    console.log(`   ✓ ${cats} categorías, ${tariffs} tarifas\n`);
    totalCats += cats;
    totalTariffs += tariffs;
  }

  console.log(`Total: ${totalCats} categorías, ${totalTariffs} tarifas`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
