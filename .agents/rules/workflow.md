# Flujo de Trabajo — ImpactaREP

## Antes de implementar cualquier tarea

1. **Consultar `ImpactaREP-recy-project.md`**: Entender contexto, módulos, modelo de datos, glosario REP.
2. **Consultar `coding-standards.md`**: Seguir convenciones de TypeScript, tRPC, Drizzle.
3. **Consultar `architecture.md`**: Entender la infra (Contabo + Dokploy + PostgreSQL).
4. **Clarificar si hay ambigüedad**: Preguntar antes de asumir.

## Flujo de creación de un Feature

```
1. Schema → Definir tabla(s) en src/db/schema/
2. Migration → drizzle-kit generate + drizzle-kit push
3. Router → Crear/extender tRPC router con procedures
4. UI → Componentes React (Server/Client según necesidad)
5. Tests → Unit (Vitest) para lógica + E2E (Playwright) para flujos
6. Review → Code review antes de merge
```

### Ejemplo: Agregar un nuevo módulo

```
src/
├── db/schema/nuevo-modulo.ts       ← 1. Schema Drizzle
├── server/routers/nuevo-modulo.ts  ← 3. tRPC router
├── app/(dashboard)/nuevo-modulo/
│   ├── page.tsx                    ← 4. Server Component (listado)
│   └── _components/
│       ├── form.tsx                ← 4. Client Component (formulario)
│       └── table.tsx               ← 4. Tabla con shadcn DataTable
└── tests/
    └── nuevo-modulo.test.ts        ← 5. Tests
```

## Flujo de deploy

```
1. Push a main → GitHub Actions CI (lint + type-check + test)
2. Build Docker image → Push a registry
3. Dokploy detecta nueva imagen → Deploy automático
4. SSL renovado automáticamente (Let's Encrypt via Traefik)
```

## Al depurar errores

1. **Verificar logs**: Dokploy muestra logs del container en su UI.
2. **Verificar DB**: Conectar a PostgreSQL vía Dokploy o `psql` directo.
3. **Verificar tenant**: ¿El `org_id` es correcto? ¿El middleware lo inyecta?
4. **Verificar Clerk**: ¿El webhook sync está funcionando? ¿Los roles son correctos?

## Cálculos de negocio REP

Los cálculos financieros y de cumplimiento son la parte más crítica:

- **POM**: `SUM(sku.peso_unitario * pom_entry.cantidad)` por material y periodo
- **Costo REP**: `POM_por_material * tarifa_sistema_gestion` por cada sistema
- **Cumplimiento**: `POM_real / meta_decreto * 100` → semáforo verde/amarillo/rojo
- **Ecodiseño**: Recalcular POM y costos con SKU modificado vs. original

Siempre testear estos cálculos con datos reales del dominio chileno (UF, materiales REP).

## Al completar una tarea

1. **Tests pasan**: `npm run test`
2. **TypeScript compila**: `npm run type-check`
3. **Lint limpio**: `npm run lint`
4. **Documentar**: Actualizar docstrings y README si aplica
5. **Review**: Code review antes de merge a main
