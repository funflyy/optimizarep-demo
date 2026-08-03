import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { db } from "@/server/db";
import { users, organizations } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { toFriendlyError } from "@/server/db-errors";

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

/**
 * Convierte errores de Postgres en mensajes accionables antes de que salgan
 * al cliente. Va en la base para que aplique a todo procedure.
 */
const withDbErrors = t.middleware(async ({ next }) => {
  try {
    return await next();
  } catch (err) {
    throw toFriendlyError(err);
  }
});

export const publicProcedure = t.procedure.use(withDbErrors);

/**
 * Procedure protegido — requiere userId de Clerk.
 */
export const protectedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});

/**
 * Procedure con usuario de la BD — base de las capas con scope.
 * Resuelve: isSuperAdmin, role, enterpriseId, orgDbId.
 *
 * ESTRICTO: el user DEBE existir en la BD (pre-registrado por admin).
 * Si no existe o está inactivo, FORBIDDEN.
 *
 * Para pre-registrar un user: usar scripts/promote-superadmin.ts o
 * scripts/promote-enterprise-admin.ts, o INSERT manual en users.
 */
export const userProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const row = await ctx.db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, ctx.userId))
    .limit(1);

  const user = row[0];

  if (!user) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Usuario no registrado. Contacta al administrador para ser invitado.",
    });
  }

  if (!user.isActive) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Usuario desactivado. Contacta al administrador.",
    });
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
