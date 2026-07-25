# SUPERADMIN y Capas de Acceso

## Modelo de 3 capas

```
Superadmin (OptimizaREP)        → controla toda la plataforma
        ↓
Enterprise Admin (ej. MB)       → controla las orgs de su enterprise
        ↓
Org User (cliente de la buyer)  → solo su org
```

## Roles

| Rol | Scope | Definido en |
|---|---|---|
| `superadmin` | Toda la plataforma, todas las enterprises y orgs | `users.isSuperAdmin = true` |
| `enterprise_admin` | Una enterprise (todas sus orgs) | `users.role = "enterprise_admin"` |
| `admin` | Una org (orgs-level) | `users.role = "admin"` |
| `analyst` | Una org, lectura + edición | `users.role = "analyst"` |
| `viewer` | Una org, solo lectura | `users.role = "viewer"` |

## Cómo promover un user

### 1. Superadmin (vos, Lucho)

```bash
# Opción A: por clerk_user_id (lo ves en Clerk dashboard)
pnpm tsx scripts/promote-superadmin.ts user_2abc123def

# Opción B: por email
pnpm tsx scripts/promote-superadmin.ts --by-email lucho@example.com

# Opción C: el primer user de la BD
pnpm tsx scripts/promote-superadmin.ts --first
```

Después: **cerrar sesión y volver a iniciar** para que el contexto tRPC se refresque.

### 2. Enterprise Admin (ej. MB)

```bash
# Necesitas el UUID de la enterprise MB
pnpm tsx scripts/promote-enterprise-admin.ts <clerk_user_id> <enterprise_id>
pnpm tsx scripts/promote-enterprise-admin.ts --by-email admin@mb.cl <enterprise_id>
```

Para sacar el UUID de MB:
```sql
SELECT id, name FROM enterprises;
```

### 3. Org User / Org Admin

```sql
UPDATE users
SET role = 'admin' | 'analyst' | 'viewer',
    organization_id = '<uuid_de_org>'
WHERE email = 'user@cliente.cl';
```

## Procedures (tRPC)

| Procedure | Puede usar |
|---|---|
| `superAdminProcedure` | solo superadmin |
| `enterpriseAdminProcedure` | superadmin o enterprise_admin |
| `adminProcedure` | superadmin, enterprise_admin, admin de org |
| `orgProcedure` | cualquier user autenticado con org (los queries filtran por org) |
| `userProcedure` | cualquier user autenticado (base) |
| `protectedProcedure` | Clerk autenticado (sin DB lookup) |
| `publicProcedure` | sin auth |

## Estructura de tablas

```
enterprises          (top-level tenant)
  └── organizations  (cliente de la enterprise)
        └── users    (pertenece a una org)
              └─ is_super_admin: bypass total
              └─ role: admin | enterprise_admin | analyst | viewer
              └─ organizationId: org a la que pertenece
```

## Rutas UI

| Ruta | Acceso |
|---|---|
| `/admin` | superadmin |
| `/enterprise` | superadmin o enterprise_admin |
| `/dashboard`, `/products`, `/costs`, etc. | cualquier user autenticado con org |

## Clerk: solo para identidad

Usamos Clerk para **login + signup + sesión**. Los roles viven en **nuestra BD** (`users.role` + `users.isSuperAdmin`). Esto nos mantiene portables si queremos cambiar de proveedor.

Para invitar usuarios:
- Opción A: Clerk dashboard → Users → Invite user (envía email)
- Opción B: Nuestra `/enterprise` page → botón "Invitar" (próximo sprint)

## Demo con 3 usuarios

1. Vos (Lucho) → superadmin vía `pnpm tsx scripts/promote-superadmin.ts --first`
2. MB admin → enterprise_admin vía `pnpm tsx scripts/promote-enterprise-admin.ts`
3. Cliente → org_user via SQL directo

## Próximos pasos (post-demo)

- UI de invitación desde `/enterprise`
- Audit log de acciones cross-org
- Permisos granulares por feature
- SSO / SAML para enterprise
