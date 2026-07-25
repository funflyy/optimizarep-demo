import { createTRPCRouter, userProcedure } from "@/server/trpc";

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
});
