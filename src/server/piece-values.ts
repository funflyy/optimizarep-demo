/**
 * Pieza validada → fila de `product_pieces`.
 *
 * `recycled_percentage` es decimal en la base y Drizzle lo escribe como texto,
 * mientras que el formulario y el parser de Excel trabajan con números. La
 * conversión vive en un solo lugar para que el formulario, la importación desde
 * la UI y el script de carga masiva no la resuelvan cada uno a su manera.
 */
export function pieceValues<T extends { recycledPercentage?: number }>(
  piece: T,
  productId: string
) {
  const { recycledPercentage, ...rest } = piece;
  return {
    ...rest,
    productId,
    recycledPercentage:
      recycledPercentage === undefined ? null : String(recycledPercentage),
  };
}
