/**
 * Mapeo entre el catálogo dinámico de productos prioritarios
 * (priority_products.code) y el enum legacy products.product_type.
 */
export const LEGACY_PRODUCT_TYPE: Record<string, string> = {
  pilas_aee: "pilas",
};

export function legacyProductType(
  code: string | null | undefined
): string | null {
  if (!code) return null;
  return LEGACY_PRODUCT_TYPE[code] ?? code;
}

/** Cookie que replica la selección para componentes de servidor */
export const PRIORITY_PRODUCT_COOKIE = "impactarep_pp";
