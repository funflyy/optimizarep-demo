import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, superAdminProcedure } from "@/server/trpc";
import { enterprises, organizations, users } from "@/server/db/schema";
import { eq, asc, isNull } from "drizzle-orm";

/**
 * Router Superadmin — solo accesible para usuarios con is_super_admin = true.
 * Controla toda la plataforma: enterprises, organizations, users.
 */
export const superAdminRouter = createTRPCRouter({
  /** Lista todas las enterprises (tenants top-level) */
  listEnterprises: superAdminProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(enterprises).orderBy(asc(enterprises.name));
  }),

  /** Crea una nueva enterprise */
  createEnterprise: superAdminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        rut: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(enterprises)
        .values(input)
        .returning();
      return row;
    }),

  /** Lista todas las orgs (con filtro opcional por enterprise) */
  listOrgs: superAdminProcedure
    .input(
      z
        .object({
          enterpriseId: z.string().uuid().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      if (input?.enterpriseId) {
        return ctx.db
          .select()
          .from(organizations)
          .where(eq(organizations.enterpriseId, input.enterpriseId))
          .orderBy(asc(organizations.name));
      }
      return ctx.db.select().from(organizations).orderBy(asc(organizations.name));
    }),

  /** Asigna una org a una enterprise */
  assignOrgToEnterprise: superAdminProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        enterpriseId: z.string().uuid().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .update(organizations)
        .set({ enterpriseId: input.enterpriseId, updatedAt: new Date() })
        .where(eq(organizations.id, input.orgId))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  /** Lista todos los users (con filtro por rol/superadmin) */
  listUsers: superAdminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: users.id,
        clerkUserId: users.clerkUserId,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        isSuperAdmin: users.isSuperAdmin,
        isActive: users.isActive,
        organizationId: users.organizationId,
      })
      .from(users)
      .orderBy(asc(users.email));
  }),

  /** Promueve un user a superadmin (o lo quita) */
  setSuperAdmin: superAdminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        isSuperAdmin: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .update(users)
        .set({ isSuperAdmin: input.isSuperAdmin, updatedAt: new Date() })
        .where(eq(users.id, input.userId))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),
});
