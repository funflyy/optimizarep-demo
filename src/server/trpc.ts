import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { db } from "@/server/db";
import { organizations } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";

/**
 * Context — se crea por cada request tRPC.
 * Extrae userId y orgId de Clerk.
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const { userId, orgId } = await auth();

  return {
    db,
    userId,
    orgId,
    ...opts,
  };
};

/**
 * Inicialización de tRPC con superjson para serializar dates, maps, etc.
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Router y procedure builders
 */
export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

/**
 * Procedure público — sin autenticación requerida
 */
export const publicProcedure = t.procedure;

/**
 * Procedure protegido — requiere usuario autenticado vía Clerk.
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
    },
  });
});

/**
 * Procedure con organización — resuelve Clerk orgId (org_xxx) →
 * organizations.id (UUID interno) vía clerk_org_id.
 *
 * orgDbId = null → sin organización activa (desarrollo pre-Fase 3):
 * los routers muestran la vista global (todas las organizaciones).
 * En Fase 3 esto pasará a lanzar FORBIDDEN si no hay org seleccionada.
 */
export const orgProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  let orgDbId: string | null = null;
  if (ctx.orgId) {
    const org = await ctx.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.clerkOrgId, ctx.orgId))
      .limit(1);
    orgDbId = org[0]?.id ?? null;
  }

  return next({
    ctx: {
      ...ctx,
      orgDbId,
    },
  });
});

