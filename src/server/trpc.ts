import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { db } from "@/server/db";
import { users, organizations, enterprises } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";

/**
 * Contexto tRPC — se crea por cada request.
 * Inicial: solo Clerk userId.
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const { userId } = await auth();
  return { db, userId, ...opts };
};

/**
 * Init tRPC con superjson.
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

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

/**
 * Procedure protegido — requiere userId de Clerk.
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});

/**
 * Procedure con usuario de la BD — base de las capas con scope.
 * Resuelve: isSuperAdmin, role, enterpriseId, orgDbId.
 *
 * Dev: si el user no existe en la BD, lo crea con role=viewer.
 *      (En prod, el user DEBE existir en la BD antes de loguearse.)
 */
export const userProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  let row = await ctx.db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, ctx.userId))
    .limit(1);

  let user = row[0];

  // Dev: auto-create user as viewer if not yet synced
  if (!user && process.env.NODE_ENV !== "production") {
    const [created] = await ctx.db
      .insert(users)
      .values({
        clerkUserId: ctx.userId,
        email: ctx.userId,
        role: "viewer",
      })
      .returning();
    user = created;
  }

  if (!user) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Usuario no registrado en la plataforma",
    });
  }

  if (!user.isActive) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Usuario desactivado" });
  }

  // Resolver enterpriseId desde la org del user
  let enterpriseId: string | null = null;
  if (user.organizationId) {
    const org = await ctx.db
      .select({ enterpriseId: organizations.enterpriseId })
      .from(organizations)
      .where(eq(organizations.id, user.organizationId))
      .limit(1);
    enterpriseId = org[0]?.enterpriseId ?? null;
  }

  return next({
    ctx: {
      ...ctx,
      user,
      isSuperAdmin: user.isSuperAdmin,
      role: user.role,
      orgDbId: user.organizationId,
      enterpriseId,
    },
  });
});

/**
 * Procedure superadmin — solo plataforma.
 * Bypassa todo scope de tenant.
 */
export const superAdminProcedure = userProcedure.use(({ ctx, next }) => {
  if (!ctx.isSuperAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Se requiere superadmin",
    });
  }
  return next({ ctx });
});

/**
 * Procedure enterprise admin — admins de una enterprise.
 * Superadmin también pasa.
 */
export const enterpriseAdminProcedure = userProcedure.use(
  ({ ctx, next }) => {
    if (ctx.isSuperAdmin) return next({ ctx });
    if (ctx.role === "enterprise_admin" && ctx.enterpriseId) {
      return next({ ctx });
    }
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Se requiere admin de enterprise",
    });
  }
);

/**
 * Procedure admin — admin de org (legacy compat con routers existentes).
 * Superadmin y enterprise_admin también pasan.
 */
export const adminProcedure = userProcedure.use(({ ctx, next }) => {
  if (ctx.isSuperAdmin) return next({ ctx });
  if (ctx.role === "enterprise_admin" && ctx.enterpriseId) {
    return next({ ctx });
  }
  if (ctx.role === "admin" && ctx.orgDbId) {
    return next({ ctx });
  }
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Se requiere rol admin",
  });
});

/**
 * Procedure con org — cualquier user autenticado con org asignada.
 * Para queries/mutations scopeadas a la org del user.
 */
export const orgProcedure = userProcedure.use(({ ctx, next }) => {
  // Superadmin puede actuar sin org; los queries deben manejar orgId explícito
  if (ctx.isSuperAdmin) return next({ ctx });
  if (!ctx.orgDbId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Sin organización activa",
    });
  }
  return next({ ctx });
});
