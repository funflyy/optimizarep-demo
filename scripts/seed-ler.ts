/**
 * Catálogo LER (Listado Europeo de Residuos) para la gestión industrial.
 *
 * Son los códigos con los que el productor declara al SINADER los residuos que
 * entrega a gestores. La lista es la que entregó MB; se puede ampliar sin tocar
 * código porque el módulo lee de la tabla.
 *
 * Idempotente: upsert por código.
 *
 * Uso: pnpm tsx scripts/seed-ler.ts
 */
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { asc } from "drizzle-orm";
import * as schema from "../src/server/db/schema";

loadEnvConfig(process.cwd());

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL (revisar .env.local)");
  process.exit(1);
}

/** Códigos 15 01 xx = envases; 20 01 xx = fracciones de residuo municipal */
const LER = [
  { code: "15 01 01", description: "Envases de papel y cartón" },
  { code: "15 01 02", description: "Envases de plástico" },
  { code: "15 01 03", description: "Envases de madera" },
  { code: "15 01 04", description: "Envases metálicos" },
  { code: "15 01 05", description: "Envases compuestos" },
  { code: "15 01 06", description: "Mezclas de envases" },
  { code: "15 01 07", description: "Envases de vidrio" },
  { code: "20 01 01", description: "Papel y cartón" },
  { code: "20 01 02", description: "Vidrio" },
  { code: "20 01 39", description: "Plásticos" },
];

async function main() {
  const sql = postgres(DATABASE_URL!, { max: 1 });
  const db = drizzle(sql, { schema });

  let n = 0;
  for (const [i, ler] of LER.entries()) {
    await db
      .insert(schema.lerCodes)
      .values({ ...ler, sortOrder: i })
      .onConflictDoUpdate({
        target: schema.lerCodes.code,
        set: { description: ler.description, sortOrder: i },
      });
    n++;
  }

  console.log(`✓ ${n} códigos LER`);
  for (const r of await db
    .select()
    .from(schema.lerCodes)
    .orderBy(asc(schema.lerCodes.sortOrder))) {
    console.log(`  ${r.code}  ${r.description}`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
