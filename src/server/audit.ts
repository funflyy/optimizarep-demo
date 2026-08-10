/**
 * Registro de auditoría.
 *
 * MB necesita respaldar que fue el cliente quien creó o modificó un SKU, con
 * fecha y hora, porque esa información termina siendo parte de lo declarado.
 * La tabla `audit_log` ya existía en el schema y no se escribía desde ninguna
 * parte.
 *
 * Nunca hace fallar la operación que audita: si el registro falla, se deja
 * constancia en el log del servidor y la mutación sigue. Perder una traza es
 * malo, pero perder el dato del cliente por un fallo de auditoría es peor.
 */
import { auditLog } from "@/server/db/schema";

type Db = typeof import("@/server/db").db;

export type AuditAction = "create" | "update" | "delete" | "import";

export interface AuditEntry {
  organizationId: string | null;
  userId: string | null;
  /** Entidad afectada: 'products', 'tariff_mappings', 'industrial_waste'... */
  entity: string;
  entityId?: string | null;
  action: AuditAction;
  /** Qué cambió. Conviene incluir el SKU para poder leerlo sin joins. */
  changes?: Record<string, unknown>;
}

export async function recordAudit(db: Db, entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLog).values({
      organizationId: entry.organizationId,
      userId: entry.userId,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      action: entry.action,
      changes: entry.changes ?? null,
    });
  } catch (err) {
    console.error("[audit] no se pudo registrar la traza", entry.entity, err);
  }
}
