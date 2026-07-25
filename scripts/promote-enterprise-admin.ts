/**
 * Bootstrap — promueve un user a enterprise_admin de una enterprise.
 *
 * Uso:
 *   pnpm tsx scripts/promote-enterprise-admin.ts <clerk_user_id> <enterprise_id>
 *   pnpm tsx scripts/promote-enterprise-admin.ts --by-email <email> <enterprise_id>
 *
 * El user queda con role=enterprise_admin y organizationId apuntando a la
 * primera org de la enterprise (o NULL si así se prefiere).
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and, asc } from "drizzle-orm";
import * as schema from "../src/server/db/schema";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/optimizarep";

const sql = postgres(DATABASE_URL);
const db = drizzle(sql, { schema });

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error(
      "Uso: pnpm tsx scripts/promote-enterprise-admin.ts <clerk_user_id> <enterprise_id>"
    );
    console.error("     pnpm tsx scripts/promote-enterprise-admin.ts --by-email <email> <enterprise_id>");
    process.exit(1);
  }

  let target: typeof schema.users.$inferSelect | undefined;
  let enterpriseId: string;

  if (args[0] === "--by-email") {
    const email = args[1];
    enterpriseId = args[2];
    const rows = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    target = rows[0];
  } else {
    const clerkUserId = args[0];
    enterpriseId = args[1];
    const rows = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.clerkUserId, clerkUserId))
      .limit(1);
    target = rows[0];
  }

  if (!target) {
    console.error("User no encontrado en la BD");
    process.exit(1);
  }

  // Validar enterprise
  const ent = await db
    .select()
    .from(schema.enterprises)
    .where(eq(schema.enterprises.id, enterpriseId))
    .limit(1);
  if (!ent[0]) {
    console.error("Enterprise no encontrada:", enterpriseId);
    process.exit(1);
  }

  // Buscar la primera org de la enterprise para asignar al admin
  const firstOrg = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.enterpriseId, enterpriseId))
    .orderBy(asc(schema.organizations.name))
    .limit(1);

  await db
    .update(schema.users)
    .set({
      role: "enterprise_admin",
      organizationId: firstOrg[0]?.id ?? null,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, target.id));

  console.log(`✓ ${target.email} ahora es enterprise_admin de "${ent[0].name}"`);
  if (firstOrg[0]) {
    console.log(`  → home org: ${firstOrg[0].id}`);
  }
  console.log("  → cerrar sesión y volver a iniciar para refrescar el contexto");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
