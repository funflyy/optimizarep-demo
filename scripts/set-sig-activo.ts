/**
 * Asigna el SIG activo de una organización para un producto prioritario.
 *
 * `getCostRows` (src/server/routers/costs.ts) llega al sistema de gestión a
 * través de `organization_priority_products.active_system_id`. Si la
 * organización no tiene fila ahí, `systemName` queda NULL y el Resumen
 * Ejecutivo muestra 0 ton / 0 SKUs / UF 0 en cuanto se filtra por un SIG,
 * aunque los productos y las tarifas estén cargados.
 *
 * Idempotente: upsert por (organización, producto prioritario).
 *
 * Uso:
 *   pnpm tsx scripts/set-sig-activo.ts                       (lista el estado)
 *   pnpm tsx scripts/set-sig-activo.ts "MB Empresas" envases_embalajes ReSimple
 */
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../src/server/db/schema";

loadEnvConfig(process.cwd());

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL (revisar .env.local)");
  process.exit(1);
}

async function main() {
  const sql = postgres(DATABASE_URL!, { max: 1 });
  const db = drizzle(sql, { schema });

  const [orgName, ppCode, sigName] = process.argv.slice(2);

  // Sin argumentos: mostrar el estado actual
  if (!orgName) {
    const rows = await db.query.organizationPriorityProducts.findMany({
      with: {
        organization: true,
        priorityProduct: true,
        activeSystem: true,
      },
    });
    if (rows.length === 0) {
      console.log("No hay ningún SIG activo configurado.");
      console.log("Sin esto el Resumen Ejecutivo muestra 0 al filtrar por SIG.");
    } else {
      console.log("SIG activos configurados:");
      for (const r of rows) {
        console.log(
          `  ${r.organization?.name} · ${r.priorityProduct?.name} → ${r.activeSystem?.name ?? "(ninguno)"}${r.isExempt ? " [exento]" : ""}`
        );
      }
    }
    console.log(
      "\nUso: pnpm tsx scripts/set-sig-activo.ts <organización> <código PP> <SIG>"
    );
    await sql.end();
    return;
  }

  if (!ppCode || !sigName) {
    console.error("Faltan argumentos: <organización> <código PP> <SIG>");
    process.exit(1);
  }

  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.name, orgName),
  });
  if (!org) {
    console.error(`No existe la organización "${orgName}"`);
    process.exit(1);
  }

  const pp = await db.query.priorityProducts.findFirst({
    where: eq(schema.priorityProducts.code, ppCode),
  });
  if (!pp) {
    console.error(`No existe el producto prioritario con código "${ppCode}"`);
    process.exit(1);
  }

  const sig = await db.query.managementSystems.findFirst({
    where: eq(schema.managementSystems.name, sigName),
  });
  if (!sig) {
    console.error(`No existe el sistema de gestión "${sigName}"`);
    process.exit(1);
  }

  await db
    .insert(schema.organizationPriorityProducts)
    .values({
      organizationId: org.id,
      priorityProductId: pp.id,
      activeSystemId: sig.id,
    })
    .onConflictDoUpdate({
      target: [
        schema.organizationPriorityProducts.organizationId,
        schema.organizationPriorityProducts.priorityProductId,
      ],
      set: { activeSystemId: sig.id, isActive: true, updatedAt: new Date() },
    });

  console.log(`✓ ${org.name} · ${pp.name} → ${sig.name}`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
