/**
 * Importa una línea base de productos desde Excel, por consola.
 *
 * Usa el mismo parser que la pantalla de importación
 * (`src/lib/parse-products-sheet.ts`), así que el resultado es idéntico; sirve
 * para recargar de golpe sin pasar por el navegador, por ejemplo después de un
 * cambio de schema.
 *
 * Uso:
 *   pnpm tsx scripts/importar-linea-base.ts <archivo.xlsx> "<organización>"
 *   pnpm tsx scripts/importar-linea-base.ts <archivo.xlsx> "MB Empresas" --reemplazar
 *
 * `--reemplazar` borra los productos existentes de esa organización antes de
 * cargar (las piezas y las ventas se van en cascada). Sin el flag, los SKU que
 * ya existan se omiten.
 */
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray } from "drizzle-orm";
import * as XLSX from "xlsx";
import { readFileSync, existsSync } from "node:fs";
import * as schema from "../src/server/db/schema";
import { pieceValues } from "../src/server/piece-values";
import {
  isImportable,
  parseProductsSheet,
} from "../src/lib/parse-products-sheet";

loadEnvConfig(process.cwd());

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL (revisar .env.local)");
  process.exit(1);
}

async function main() {
  const [path, orgName] = process.argv.slice(2);
  const reemplazar = process.argv.includes("--reemplazar");

  if (!path || !orgName) {
    console.error(
      'Uso: pnpm tsx scripts/importar-linea-base.ts <archivo.xlsx> "<organización>" [--reemplazar]'
    );
    process.exit(1);
  }
  if (!existsSync(path)) {
    console.error(`No existe el archivo: ${path}`);
    process.exit(1);
  }

  const sql = postgres(DATABASE_URL!, { max: 1 });
  const db = drizzle(sql, { schema });

  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.name, orgName),
  });
  if (!org) {
    console.error(`No existe la organización "${orgName}"`);
    process.exit(1);
  }

  // El producto prioritario por defecto, igual que el router
  const pp = await db.query.priorityProducts.findFirst({
    where: eq(schema.priorityProducts.code, "envases_embalajes"),
  });

  console.log(`Leyendo ${path}`);
  const wb = XLSX.read(readFileSync(path), { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
  console.log(`  ${rows.length} filas en la hoja "${wb.SheetNames[0]}"\n`);

  const parsed = parseProductsSheet(rows);
  const importables = parsed.filter(isImportable);
  console.log(
    `Parseados ${parsed.length} productos: ${importables.length} válidos, ${parsed.length - importables.length} con errores`
  );

  const avisos = parsed.filter((p) => p.warnings.length > 0);
  if (avisos.length > 0) console.log(`  ${avisos.length} con avisos`);

  if (reemplazar) {
    const borrados = await db
      .delete(schema.products)
      .where(eq(schema.products.organizationId, org.id))
      .returning({ id: schema.products.id });
    console.log(`\n  ${borrados.length} productos borrados (piezas y ventas en cascada)`);
  }

  const existentes = new Set(
    (
      await db
        .select({ sku: schema.products.sku })
        .from(schema.products)
        .where(eq(schema.products.organizationId, org.id))
    ).map((r) => r.sku)
  );

  let creados = 0;
  let omitidos = 0;
  const fallidos: string[] = [];

  for (const prod of importables) {
    if (existentes.has(prod.sku)) {
      omitidos++;
      continue;
    }
    try {
      await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(schema.products)
          .values({
            organizationId: org.id,
            sku: prod.sku,
            name: prod.name,
            brand: prod.brand || null,
            category: prod.category || null,
            family: prod.family ?? null,
            subfamily: prod.subfamily ?? null,
            priorityProductId: pp?.id ?? null,
          })
          .returning();

        await tx
          .insert(schema.productPieces)
          .values(prod.pieces.map((p) => pieceValues(p, row.id)));

        if (prod.sales.length > 0) {
          await tx.insert(schema.salesRecords).values(
            prod.sales.map((s) => ({
              productId: row.id,
              year: s.year,
              month: s.month,
              segment: s.segment,
              unitsSold: s.unitsSold,
            }))
          );
        }
      });
      creados++;
    } catch (err) {
      fallidos.push(
        `${prod.sku}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  console.log(
    `\n✓ ${creados} creados${omitidos ? `, ${omitidos} omitidos por existir` : ""}${fallidos.length ? `, ${fallidos.length} con error` : ""}`
  );
  for (const f of fallidos) console.log(`   ${f}`);

  // Resumen de lo cargado
  const skus = importables.map((p) => p.sku);
  if (skus.length > 0) {
    const cargados = await db
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(inArray(schema.products.sku, skus));
    console.log(`\n  ${cargados.length} productos en la organización`);
  }

  if (avisos.length > 0) {
    console.log("\n⚠ AVISOS DEL PARSEO (primeros 10):");
    for (const p of avisos.slice(0, 10)) {
      console.log(`   ${p.sku}: ${p.warnings.join(" · ")}`);
    }
    if (avisos.length > 10) console.log(`   ... y ${avisos.length - 10} más`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
