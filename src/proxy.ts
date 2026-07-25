import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

/**
 * Proxy (Next 16, ex-middleware) — habilita el contexto de Clerk para que
 * auth() funcione en Server Components y en el contexto tRPC.
 * Todas las rutas requieren sesión salvo sign-in / sign-up.
 * En navegación redirige a /sign-in; en requests fetch (tRPC) responde 401.
 */
export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
