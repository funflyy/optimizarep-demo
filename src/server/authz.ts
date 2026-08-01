/**
 * Alcance por organización — una sola regla, usada por la UI y por el servidor.
 *
 * `listWritableOrgs` alimenta los selectores de organización y
 * `resolveTargetOrg` valida la escritura. Comparten la misma lógica a
 * propósito: si divergen, la UI ofrece organizaciones que el servidor rechaza.
 */
import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { organizations } from "@/server/db/schema";

type Db = typeof import("@/server/db").db;

/** Lo que hace falta del contexto tRPC para decidir el alcance. */
export interface OrgScope {
  isSuperAdmin: boolean;
  role: string;
  orgDbId: string | null;
  enterpriseId: string | null;
}

export interface WritableOrg {
  id: string;
  name: string;
}

/**
 * Organizaciones en las que el usuario puede escribir:
 * - superadmin        → todas (controla la plataforma)
 * - enterprise_admin  → las de su enterprise
 * - resto             → solo la propia
 */
export async function listWritableOrgs(
  db: Db,
  ctx: OrgScope
): Promise<WritableOrg[]> {
  const columns = { id: organizations.id, name: organizations.name };

  if (ctx.isSuperAdmin) {
    return db.select(columns).from(organizations).orderBy(asc(organizations.name));
  }

  if (ctx.role === "enterprise_admin" && ctx.enterpriseId) {
    return db
      .select(columns)
      .from(organizations)
      .where(eq(organizations.enterpriseId, ctx.enterpriseId))
      .orderBy(asc(organizations.name));
  }

  if (ctx.orgDbId) {
    return db
      .select(columns)
      .from(organizations)
      .where(eq(organizations.id, ctx.orgDbId));
  }

  return [];
}

/**
 * Resuelve la organización destino de una escritura y verifica el permiso.
 *
 * Sin `requested` cae en la organización del usuario. Con `requested`, exige
 * que esté entre las que puede escribir — así un usuario común no puede
 * escribir en otra organización pasando un id a mano.
 */
export async function resolveTargetOrg(
  db: Db,
  ctx: OrgScope,
  requested?: string
): Promise<string> {
  if (!requested) {
    if (ctx.orgDbId) return ctx.orgDbId;
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: ctx.isSuperAdmin
        ? "Sin organización activa: elegir la organización destino"
        : "Sin organización activa",
    });
  }

  const allowed = await listWritableOrgs(db, ctx);
  if (!allowed.some((o) => o.id === requested)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Sin permiso para escribir en esa organización",
    });
  }
  return requested;
}
