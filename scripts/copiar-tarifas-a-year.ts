/**
 * Copia las tarifas de un año a otro, para pruebas.
 *
 * La línea base de prueba (EJEMPLO LB_1.xlsx) es de 2025, pero las tarifas
 * publicadas de ReSimple y Giro que trae el Excel son de 2026. Sin tarifa
 * para 2025 no hay nada que calcular, así que se copian.
 *
 * OJO — los valores copiados NO son las tarifas oficiales del año destino.
 * Quedan marcados en `source` con el prefijo COPIA_PRUEBA para poder
 * distinguirlos y borrarlos:
 *
 *   pnpm tsx scripts/copiar-tarifas-a-year.ts --limpiar 2025
 *
 * Cuando estén las tarifas reales del año, cargarlas con
 * scripts/import-tarifas-sig.ts y borrar las copias.
 *
 * Uso:
 *   pnpm tsx scripts/copiar-tarifas-a-year.ts 2026 2025   (desde → hacia)
 *   pnpm tsx scripts/copiar-tarifas-a-year.ts --limpiar 2025
 */
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
// `sql` (el tag de Drizzle) se importa con alias: el cliente de postgres
// también se llama sql en este script.
import { and, count, eq, like, desc } from "drizzle-orm";
import * as schema from "../src/server/db/schema";

loadEnvConfig(process.cwd());

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL (revisar .env.local)");
  process.exit(1);
}

const MARCA = "COPIA_PRUEBA";

async function main() {
  const sql = postgres(DATABASE_URL!, { max: 1 });
  const db = drizzle(sql, { schema });

  const args = process.argv.slice(2);

  // ── Modo limpieza ────────────────────────────────────────────
  if (args[0] === "--limpiar") {
    const year = Number(args[1]);
    if (!Number.isInteger(year)) {
      console.error("Uso: --limpiar <año>");
      process.exit(1);
    }
    const borradas = await db
      .delete(schema.tariffs)
      .where(
        and(
          eq(schema.tariffs.year, year),
          like(schema.tariffs.source, `${MARCA}%`)
        )
      )
      .returning({ id: schema.tariffs.id });
    console.log(`Borradas ${borradas.length} tarifas de prueba del año ${year}`);
    await sql.end();
    return;
  }

  // ── Modo copia ───────────────────────────────────────────────
  const from = Number(args[0] ?? 2026);
  const to = Number(args[1] ?? 2025);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) {
    console.error("Uso: copiar-tarifas-a-year.ts <desde> <hacia>");
    process.exit(1);
  }

  const origen = await db
    .select()
    .from(schema.tariffs)
    .where(eq(schema.tariffs.year, from));

  if (origen.length === 0) {
    console.log(`No hay tarifas del año ${from}: nada que copiar`);
    await sql.end();
    return;
  }

  console.log(`Copiando ${origen.length} tarifas de ${from} → ${to}\n`);

  let creadas = 0;
  let actualizadas = 0;

  for (const t of origen) {
    const existente = await db
      .select({ id: schema.tariffs.id, source: schema.tariffs.source })
      .from(schema.tariffs)
      .where(
        and(
          eq(schema.tariffs.categoryId, t.categoryId),
          eq(schema.tariffs.year, to)
        )
      )
      .limit(1);

    // No sobrescribir una tarifa real del año destino: solo las copias
    if (existente[0] && !existente[0].source?.startsWith(MARCA)) {
      continue;
    }

    const source = `${MARCA} · copiada de ${from} · original: ${t.source ?? "—"}`;

    await db
      .insert(schema.tariffs)
      .values({
        categoryId: t.categoryId,
        year: to,
        rateUfPerTon: t.rateUfPerTon,
        rateValue: t.rateValue,
        rateUnit: t.rateUnit,
        plusIva: t.plusIva,
        source,
      })
      .onConflictDoUpdate({
        target: [schema.tariffs.categoryId, schema.tariffs.year],
        set: {
          rateUfPerTon: t.rateUfPerTon,
          rateValue: t.rateValue,
          rateUnit: t.rateUnit,
          plusIva: t.plusIva,
          source,
        },
      });

    if (existente[0]) actualizadas++;
    else creadas++;
  }

  console.log(`✓ ${creadas} creadas, ${actualizadas} actualizadas`);

  // Resumen por sistema de gestión
  const resumen = await db
    .select({ sig: schema.managementSystems.name, n: count() })
    .from(schema.tariffs)
    .innerJoin(
      schema.tariffCategories,
      eq(schema.tariffCategories.id, schema.tariffs.categoryId)
    )
    .innerJoin(
      schema.managementSystems,
      eq(schema.managementSystems.id, schema.tariffCategories.systemId)
    )
    .where(eq(schema.tariffs.year, to))
    .groupBy(schema.managementSystems.name)
    .orderBy(desc(count()));

  console.log(`\nTarifas del año ${to}:`);
  for (const r of resumen) {
    console.log(`  ${String(r.sig).padEnd(12)} ${r.n}`);
  }

  console.log(
    `\n⚠ Son copias de ${from}, NO las tarifas oficiales de ${to}.` +
      `\n  Para borrarlas: pnpm tsx scripts/copiar-tarifas-a-year.ts --limpiar ${to}`
  );

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
