/**
 * Rellena products.priority_product_id a partir de products.product_type.
 *
 * El importador de Excel no envía `priorityProductCode`, así que
 * `priority_product_id` quedaba NULL aunque `product_type` sí traía el valor
 * correcto ('envases_embalajes'). Varias pantallas filtran por el FK, no por el
 * enum — por ejemplo Mapeo de Materiales y el Resumen Ejecutivo — y por eso
 * mostraban 0 aunque los productos estuvieran cargados.
 *
 * `product_type` usa un código legacy ('pilas' en el enum, 'pilas_aee' en el
 * catálogo), así que se traduce.
 *
 * Idempotente: solo toca las filas con priority_product_id NULL.
 *
 * Uso: pnpm tsx scripts/backfill-priority-product.ts [--dry]
 */
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, isNull, count } from "drizzle-orm";
import * as schema from "../src/server/db/schema";

loadEnvConfig(process.cwd());

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL (revisar .env.local)");
  process.exit(1);
}

/** product_type (enum legacy) → priority_products.code */
const LEGACY: Record<string, string> = { pilas: "pilas_aee" };

async function main() {
  const dry = process.argv.includes("--dry");
  const sql = postgres(DATABASE_URL!, { max: 1 });
  const db = drizzle(sql, { schema });

  const pending = await db
    .select({ productType: schema.products.productType, n: count() })
    .from(schema.products)
    .where(isNull(schema.products.priorityProductId))
    .groupBy(schema.products.productType);

  if (pending.length === 0) {
    console.log("No hay productos con priority_product_id NULL");
    await sql.end();
    return;
  }

  console.log("Productos sin priority_product_id:");
  for (const p of pending) console.log(`  ${p.productType.padEnd(24)} ${p.n}`);

  const pps = await db.select().from(schema.priorityProducts);

  let total = 0;
  for (const p of pending) {
    const code = LEGACY[p.productType] ?? p.productType;
    const pp = pps.find((x) => x.code === code);
    if (!pp) {
      console.log(`  ⚠ sin catálogo para "${p.productType}" (código ${code}), se omite`);
      continue;
    }
    if (dry) {
      console.log(`  [dry] ${p.n} × ${p.productType} → ${pp.name}`);
      total += Number(p.n);
      continue;
    }
    const updated = await db
      .update(schema.products)
      .set({ priorityProductId: pp.id })
      .where(
        and(
          eq(schema.products.productType, p.productType),
          isNull(schema.products.priorityProductId)
        )
      )
      .returning({ id: schema.products.id });
    console.log(`  ✓ ${updated.length} × ${p.productType} → ${pp.name}`);
    total += updated.length;
  }

  console.log(`\n${dry ? "[dry] " : ""}${total} productos`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
