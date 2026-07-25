/**
 * Bootstrap — convierte un user a superadmin.
 *
 * Uso:
 *   pnpm tsx scripts/promote-superadmin.ts <clerk_user_id>
 *   pnpm tsx scripts/promote-superadmin.ts --by-email <email>
 *   pnpm tsx scripts/promote-superadmin.ts --first
 *     (promueve al primer user de la BD; útil para el primer superadmin)
 *
 * Idempotente: si el user ya es superadmin, no hace nada.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../src/server/db/schema";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/optimizarep";

const sql = postgres(DATABASE_URL);
const db = drizzle(sql, { schema });

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(
      "Uso: pnpm tsx scripts/promote-superadmin.ts <clerk_user_id> | --by-email <email> | --first"
    );
    process.exit(1);
  }

  let target: typeof schema.users.$inferSelect | undefined;

  if (args[0] === "--by-email") {
    const email = args[1];
    if (!email) {
      console.error("Falta el email");
      process.exit(1);
    }
    const rows = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    target = rows[0];
  } else if (args[0] === "--first") {
    const rows = await db.select().from(schema.users).limit(1);
    target = rows[0];
  } else {
    const clerkUserId = args[0];
    const rows = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.clerkUserId, clerkUserId))
      .limit(1);
    target = rows[0];
  }

  if (!target) {
    console.error("User no encontrado en la BD");
    console.error(
      "Tip: el user debe haber iniciado sesión al menos una vez (auto-creado como viewer)."
    );
    process.exit(1);
  }

  if (target.isSuperAdmin) {
    console.log(`✓ ${target.email} ya es superadmin`);
    process.exit(0);
  }

  await db
    .update(schema.users)
    .set({ isSuperAdmin: true, updatedAt: new Date() })
    .where(eq(schema.users.id, target.id));

  console.log(`✓ ${target.email} ahora es superadmin`);
  console.log("  (clerk_user_id:", target.clerkUserId, ")");
  console.log("  → cerrar sesión y volver a iniciar para refrescar el contexto");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
