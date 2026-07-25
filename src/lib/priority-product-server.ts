import { cookies } from "next/headers";
import { db } from "@/server/db";
import { PRIORITY_PRODUCT_COOKIE } from "./priority-product";

/**
 * Producto prioritario activo para componentes de servidor.
 * Lee la cookie espejo que mantiene el selector del sidebar.
 * null si no hay selección (o la cookie apunta a un código inexistente).
 */
export async function getActivePriorityProduct() {
  const store = await cookies();
  const code = store.get(PRIORITY_PRODUCT_COOKIE)?.value;
  if (!code) return null;
  const pp = await db.query.priorityProducts.findFirst({
    where: (p, { eq }) => eq(p.code, code),
  });
  return pp ?? null;
}
