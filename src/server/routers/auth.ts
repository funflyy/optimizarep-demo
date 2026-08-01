import { createTRPCRouter, userProcedure } from "@/server/trpc";
import { listWritableOrgs } from "@/server/authz";

/**
 * Router de auth — info del usuario actual.
 */
export const authRouter = createTRPCRouter({
  me: userProcedure.query(async ({ ctx }) => {
    return {
      id: ctx.user.id,
      email: ctx.user.email,
      firstName: ctx.user.firstName,
      lastName: ctx.user.lastName,
      role: ctx.role,
      isSuperAdmin: ctx.isSuperAdmin,
      enterpriseId: ctx.enterpriseId,
      orgId: ctx.orgDbId,
    };
  }),

  /**
   * Organizaciones en las que puedo escribir — alimenta los selectores de
   * organización. Misma regla que valida el servidor al escribir.
   */
  writableOrgs: userProcedure.query(async ({ ctx }) => {
    return listWritableOrgs(ctx.db, ctx);
  }),
});
