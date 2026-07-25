# 🧰 Skills del Proyecto — OptimizaREP

> **22 skills** seleccionadas para el desarrollo de la plataforma de gestión de residuos y Ley REP.
> Cada carpeta contiene el SKILL.md + recursos adicionales.

---

## 🏗️ Full-Stack — Next.js + tRPC + Drizzle

| Skill | Propósito en el proyecto |
|-------|--------------------------| 
| [nextjs-best-practices](global) | App Router, Server Components, SSR |
| [react-patterns](global) | Hooks, composición, TypeScript patterns |
| [tailwind-patterns](global) | Tailwind CSS 4, diseño premium |
| [shadcn](global) | Componentes UI: tablas, formularios, gráficos, diálogos |
| [drizzle-orm-expert](global) | ORM type-safe, schemas, migraciones |
| [neon-postgres](global) | Referencia de patrones PostgreSQL |

---

## 🔐 Autenticación

| Skill | Propósito en el proyecto |
|-------|--------------------------|
| [clerk-auth](global) | Multi-tenancy, roles, SSO, invitaciones |

---

## 📊 Dashboard y Datos

| Skill | Propósito en el proyecto |
|-------|--------------------------|
| [claude-d3js-skill](global) | Gráficos D3.js / Recharts para KPIs y evolución POM |
| [xlsx-official](./xlsx-official/SKILL.md) | Exportaciones SINADER + carga masiva Excel |

---

## 🧪 Testing y Calidad

| Skill | Propósito en el proyecto |
|-------|--------------------------|
| [tdd-workflow](./tdd-workflow/SKILL.md) | TDD para cálculos POM, cumplimiento, ecodiseño |
| [testing-patterns](./testing-patterns/SKILL.md) | Patrones de testing |
| [code-reviewer](./code-reviewer/SKILL.md) | Code review de calidad |
| [playwright-skill](global) | E2E para flujos SINADER y carga masiva |

---

## 🔒 Seguridad

| Skill | Propósito en el proyecto |
|-------|--------------------------|
| [security-auditor](./security-auditor/SKILL.md) | Auditoría de seguridad |
| [secrets-management](./secrets-management/SKILL.md) | Gestión de credenciales (.env) |

---

## 📋 Planificación y Gestión

| Skill | Propósito en el proyecto |
|-------|--------------------------|
| [concise-planning](./concise-planning/SKILL.md) | Planes de acción concisos |
| [writing-plans](./writing-plans/SKILL.md) | Escribir planes de implementación |
| [executing-plans](./executing-plans/SKILL.md) | Ejecutar planes con checkpoints |
| [ask-questions-if-underspecified](./ask-questions-if-underspecified/SKILL.md) | Clarificar antes de implementar |

---

## 📄 Documentación y DevOps

| Skill | Propósito en el proyecto |
|-------|--------------------------|
| [documentation](./documentation/SKILL.md) | README, documentación técnica |
| [powershell-windows](./powershell-windows/SKILL.md) | Scripts y comandos en Windows |
| [windows-shell-reliability](./windows-shell-reliability/SKILL.md) | Ejecución confiable de comandos |

---

## 📐 Uso por Flujo de Trabajo

### Nuevo módulo (ej. Ecodiseño)
`drizzle-orm-expert` → `react-patterns` → `shadcn` → `tdd-workflow` → `documentation`

### Dashboard / KPIs
`claude-d3js-skill` → `react-patterns` → `shadcn`

### Carga masiva / Exportación
`xlsx-official` → `testing-patterns`

### Deploy y Seguridad
`secrets-management` → `security-auditor`

### Planificación de Features
`ask-questions-if-underspecified` → `concise-planning` → `writing-plans` → `executing-plans`
