/**
 * Bootstrap — crea (o actualiza) un user en la BD a partir de su Clerk user ID.
 *
 * Necesario porque `userProcedure` exige que el user exista pre-registrado y ya
 * no hay auto-create al iniciar sesión (se quitó por seguridad en 99dac2b).
 * Sin esto, `promote-superadmin.ts` nunca encuentra a quién promover.
 *
 * Uso:
 *   pnpm tsx scripts/create-user.ts <clerk_user_id> <email> [opciones]
 *
 * Opciones:
 *   --role <admin|enterprise_admin|analyst|viewer>   (default: viewer)
 *   --superadmin                                     marca is_super_admin
 *   --org <nombre|uuid>                              asigna organización
 *   --name "<nombre> <apellido>"
 *
 * Ejemplos:
 *   pnpm tsx scripts/create-user.ts user_ABC luis@pybot.cl --superadmin --role admin --org "MB Empresas"
 *   pnpm tsx scripts/create-user.ts user_XYZ cristian.godoy@mbempresas.cl --superadmin --role admin
 *
 * Idempotente: si el clerk_user_id ya existe, actualiza sus atributos.
 */
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, or } from "drizzle-orm";
import * as schema from "../src/server/db/schema";

loadEnvConfig(process.cwd());

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL (revisar .env.local)");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(sql, { schema });

type Role = (typeof schema.userRoleEnum.enumValues)[number];

function flag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const [clerkUserId, email] = args;

  if (!clerkUserId || !email || clerkUserId.startsWith("--")) {
    console.error(
      'Uso: pnpm tsx scripts/create-user.ts <clerk_user_id> <email> [--role <rol>] [--superadmin] [--org <nombre|uuid>] [--name "Nombre Apellido"]'
    );
    process.exit(1);
  }

  const roleArg = (option(args, "role") ?? "viewer") as Role;
  if (!schema.userRoleEnum.enumValues.includes(roleArg)) {
    console.error(
      `Rol inválido: "${roleArg}". Válidos: ${schema.userRoleEnum.enumValues.join(", ")}`
    );
    process.exit(1);
  }

  const isSuperAdmin = flag(args, "superadmin");
  const [firstName, ...rest] = (option(args, "name") ?? "").split(" ");
  const lastName = rest.join(" ");

  // ── Organización (opcional) ───────────────────────────────────
  let organizationId: string | null = null;
  const orgArg = option(args, "org");
  if (orgArg) {
    const rows = await db
      .select({ id: schema.organizations.id, name: schema.organizations.name })
      .from(schema.organizations)
      .where(
        or(
          eq(schema.organizations.name, orgArg),
          // permite pasar el uuid directo
          /^[0-9a-f-]{36}$/i.test(orgArg)
            ? eq(schema.organizations.id, orgArg)
            : undefined
        )
      )
      .limit(1);
    if (rows.length === 0) {
      console.error(`Organización no encontrada: "${orgArg}"`);
      process.exit(1);
    }
    organizationId = rows[0].id;
    console.log(`• organización: ${rows[0].name}`);
  }

  // ── Upsert ────────────────────────────────────────────────────
  const [row] = await db
    .insert(schema.users)
    .values({
      clerkUserId,
      email,
      firstName: firstName || null,
      lastName: lastName || null,
      role: roleArg,
      isSuperAdmin,
      organizationId,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: schema.users.clerkUserId,
      set: {
        email,
        role: roleArg,
        isSuperAdmin,
        ...(organizationId ? { organizationId } : {}),
        isActive: true,
        updatedAt: new Date(),
      },
    })
    .returning();

  console.log(`✓ ${row.email}`);
  console.log(`  clerk_user_id : ${row.clerkUserId}`);
  console.log(`  role          : ${row.role}`);
  console.log(`  superadmin    : ${row.isSuperAdmin}`);
  console.log(`  organización  : ${row.organizationId ?? "(ninguna)"}`);
  console.log("  → cerrar sesión y volver a entrar para refrescar el contexto");
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
