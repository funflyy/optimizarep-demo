import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, enterpriseAdminProcedure } from "@/server/trpc";
import { organizations, users } from "@/server/db/schema";
import { and, eq, asc } from "drizzle-orm";

/**
 * Router Enterprise Admin — accesible para superadmin y enterprise_admin.
 * Maneja las orgs de la enterprise del usuario.
 */
export const enterpriseRouter = createTRPCRouter({
  /** Lista las orgs de mi enterprise */
  listMyOrgs: enterpriseAdminProcedure.query(async ({ ctx }) => {
    if (!ctx.enterpriseId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Sin enterprise activa",
      });
    }
    return ctx.db
      .select()
      .from(organizations)
      .where(eq(organizations.enterpriseId, ctx.enterpriseId))
      .orderBy(asc(organizations.name));
  }),

  /** Crea una org nueva dentro de mi enterprise */
  createOrg: enterpriseAdminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        rut: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.enterpriseId) throw new TRPCError({ code: "FORBIDDEN" });
      const [row] = await ctx.db
        .insert(organizations)
        .values({ ...input, enterpriseId: ctx.enterpriseId })
        .returning();
      return row;
    }),

  /** Lista los users de mi enterprise (via sus orgs) */
  listUsers: enterpriseAdminProcedure.query(async ({ ctx }) => {
    if (!ctx.enterpriseId) throw new TRPCError({ code: "FORBIDDEN" });
    return ctx.db
      .select({
        id: users.id,
        clerkUserId: users.clerkUserId,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        organizationId: users.organizationId,
        isActive: users.isActive,
      })
      .from(users)
      .innerJoin(organizations, eq(users.organizationId, organizations.id))
      .where(eq(organizations.enterpriseId, ctx.enterpriseId))
      .orderBy(asc(users.email));
  }),

  /** Asigna un rol a un user dentro de mi enterprise */
  setUserRole: enterpriseAdminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        role: z.enum(["admin", "analyst", "viewer"]),
        organizationId: z.string().uuid().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verificar que el user objetivo pertenece a una org de mi enterprise
      const target = await ctx.db
        .select({ enterpriseId: organizations.enterpriseId })
        .from(users)
        .leftJoin(organizations, eq(users.organizationId, organizations.id))
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!target[0]) throw new TRPCError({ code: "NOT_FOUND" });
      if (target[0].enterpriseId !== ctx.enterpriseId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User no pertenece a tu enterprise",
        });
      }

      // Verificar que la org destino (si se da) pertenece a mi enterprise
      if (input.organizationId) {
        const org = await ctx.db
          .select({ enterpriseId: organizations.enterpriseId })
          .from(organizations)
          .where(eq(organizations.id, input.organizationId))
          .limit(1);
        if (org[0]?.enterpriseId !== ctx.enterpriseId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Org destino no es de tu enterprise",
          });
        }
      }

      const [row] = await ctx.db
        .update(users)
        .set({
          role: input.role,
          organizationId: input.organizationId,
          updatedAt: new Date(),
        })
        .where(eq(users.id, input.userId))
        .returning();
      return row;
    }),
});
