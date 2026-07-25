"use client";

import { usePriorityProduct } from "@/components/priority-product-context";
import { legacyProductType } from "@/lib/priority-product";

/**
 * Tipo de producto (enum legacy) del producto prioritario activo en el
 * sidebar — para filtrar las consultas tRPC de cada página.
 * null mientras carga o si no hay selección.
 */
export function useProductType(): string | null {
  const { selected } = usePriorityProduct();
  return legacyProductType(selected?.code);
}
