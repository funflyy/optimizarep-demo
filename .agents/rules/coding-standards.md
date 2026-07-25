# Estándares de Codificación — OptimizaREP

## TypeScript / Next.js

- **TypeScript strict mode**: Obligatorio. No `any`, no `@ts-ignore` sin justificación.
- **Next.js App Router**: Usar Server Components por defecto. Client Components solo cuando
  se necesite interactividad (hooks, event handlers, browser APIs).
- **Importaciones**: Usar alias `@/` para imports desde `src/`.
- **Nombrado de archivos**: `kebab-case` para archivos, `PascalCase` para componentes.

## tRPC

- **Routers**: Un archivo por dominio (ej. `skus.ts`, `compliance.ts`, `ecodesign.ts`).
- **Procedures**: Validar inputs con Zod. Siempre tipar outputs.
- **Middleware**: Usar `protectedProcedure` para rutas autenticadas, `orgProcedure` para
  rutas que requieren org_id (tenant isolation).

```typescript
// Ejemplo de patrón esperado
export const skuRouter = createTRPCRouter({
  list: orgProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      materialId: z.string().uuid().optional(),
    }))
    .query(async ({ ctx, input }) => {
      // ctx.orgId ya está disponible por el middleware
      return await ctx.db.query.skus.findMany({
        where: eq(skus.orgId, ctx.orgId),
        limit: input.limit,
        offset: (input.page - 1) * input.limit,
      });
    }),
});
```

## Drizzle ORM

- **Schemas**: Un archivo por tabla en `src/db/schema/`.
- **Migraciones**: Generar con `drizzle-kit generate`. Nunca editar migraciones ya aplicadas.
- **Naming**: Tablas en `snake_case` plural (ej. `skus`, `pom_entries`, `audit_logs`).
- **Relaciones**: Definir explícitamente con `relations()`.

## Componentes React

- **Server Components** para: listados, dashboards, datos estáticos.
- **Client Components** para: formularios, gráficos interactivos, modales.
- **shadcn/ui**: Usar componentes de shadcn siempre que existan. No reinventar.
- **Composición**: Componentes pequeños y enfocados. Max ~150 líneas por componente.

## Estilos

- **Tailwind CSS 4**: Usar clases de utilidad. No CSS custom salvo excepciones justificadas.
- **`cn()`**: Usar el helper `cn()` de shadcn para merge de clases condicionales.
- **Responsive**: Mobile-first siempre.

## Testing

- **Vitest**: Unit tests para lógica de negocio (cálculos POM, cumplimiento, ecodiseño).
- **Playwright**: E2E para flujos críticos (auth, carga masiva, generación SINADER).
- **Naming**: `describe('módulo')` → `it('debería ...')` en español.

## Commits y PRs

- **Conventional Commits en español**:
  - `feat(skus): agregar carga masiva con validación fila a fila`
  - `fix(comparador): corregir cálculo de ahorro en UF`
  - `test(ecodiseño): agregar tests de comparación de escenarios`
  - `docs(readme): actualizar instrucciones de deploy`
- **PR checklist**:
  - [ ] No hay secrets hardcodeados
  - [ ] TypeScript compila sin errores (`pnpm type-check`)
  - [ ] Tests pasan (`pnpm test`)
  - [ ] Migraciones incluidas si hay cambios de schema

## Manejo de Errores

- **tRPC errors**: Usar `TRPCError` con códigos apropiados (BAD_REQUEST, NOT_FOUND, etc.)
- **Validación**: Zod en el boundary (inputs de tRPC). No validar dos veces.
- **Logging**: `console.error` en server, Sentry para errores en producción.
- **UI**: Toast notifications para errores de usuario. Error boundaries para crashes.

## Seguridad

- **Tenant isolation**: SIEMPRE filtrar por `org_id` en queries. El middleware lo inyecta.
- **Roles**: Verificar permisos en el procedure, no en la UI.
- **Uploads**: Validar tipo y tamaño de archivos. Sanitizar nombres.
- **Headers**: CSP, CORS configurados. Rate limiting en API.
