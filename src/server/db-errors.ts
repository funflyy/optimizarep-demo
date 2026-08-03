/**
 * Traduce errores de Postgres a mensajes accionables.
 *
 * Drizzle lanza `DrizzleQueryError`, cuyo `message` es el SQL completo con los
 * parámetros y deja la causa real en `cause`. tRPC no serializa `cause`, así
 * que el cliente recibía un volcado de SQL sin la razón — por ejemplo, un SKU
 * duplicado se veía como 40 líneas de `insert into "products" ...` sin decir
 * en ningún momento que el producto ya existía.
 */
import { TRPCError } from "@trpc/server";

/** Forma mínima de un error de postgres.js que nos interesa. */
interface PgError {
  code?: string;
  message?: string;
  detail?: string;
  constraint_name?: string;
  column_name?: string;
  table_name?: string;
}

/** Recorre la cadena de `cause` buscando un error con código de Postgres. */
function findPgError(err: unknown): PgError | undefined {
  const seen = new Set<unknown>();
  let cur: unknown = err;
  while (cur && typeof cur === "object" && !seen.has(cur)) {
    seen.add(cur);
    const e = cur as PgError & { cause?: unknown };
    // Los códigos de Postgres son 5 caracteres alfanuméricos (23505, 22P02...)
    if (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) return e;
    cur = e.cause;
  }
  return undefined;
}

/** Mensajes por constraint, para no exponer nombres de índices al usuario. */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  products_org_sku_idx:
    "Ya existe un producto con ese SKU en esta organización",
  sales_product_period_idx:
    "Ya existe un registro de ventas para ese período",
  users_clerk_user_id_unique: "Ese usuario ya está registrado",
  organizations_rut_unique: "Ya existe una organización con ese RUT",
};

/**
 * Convierte cualquier error en uno presentable. Los `TRPCError` que ya lanzamos
 * a propósito pasan intactos.
 */
export function toFriendlyError(err: unknown): unknown {
  if (err instanceof TRPCError) return err;

  const pg = findPgError(err);
  if (!pg) return err;

  const constraint = pg.constraint_name;

  switch (pg.code) {
    case "23505": {
      // unique_violation
      const message =
        (constraint && CONSTRAINT_MESSAGES[constraint]) ??
        "El registro ya existe";
      return new TRPCError({ code: "CONFLICT", message, cause: err });
    }
    case "23503": // foreign_key_violation
      return new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Referencia inválida: el registro apunta a algo que no existe" +
          (pg.column_name ? ` (${pg.column_name})` : ""),
        cause: err,
      });
    case "23502": // not_null_violation
      return new TRPCError({
        code: "BAD_REQUEST",
        message: `Falta un campo obligatorio${pg.column_name ? `: ${pg.column_name}` : ""}`,
        cause: err,
      });
    case "22P02": // invalid_text_representation
      return new TRPCError({
        code: "BAD_REQUEST",
        message: "Un valor tiene formato inválido",
        cause: err,
      });
    case "22001": // string_data_right_truncation
      return new TRPCError({
        code: "BAD_REQUEST",
        message: "Un texto excede el largo permitido",
        cause: err,
      });
    default:
      // Código desconocido: se muestra el mensaje de Postgres, que es mucho
      // más útil que el volcado de SQL de Drizzle.
      return new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: pg.message ?? "Error de base de datos",
        cause: err,
      });
  }
}
