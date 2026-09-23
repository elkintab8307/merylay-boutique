export type ImagenProducto = {
  id: string;
  product_id: string;
  variant_id: string | null;
  url: string;
  is_primary: boolean;
  sort_order: number;
};

export type LineaVenta = {
  product_id: string | null;
  variant_id: string | null;
  image_id: string | null;
};

const porOrden = (a: ImagenProducto, b: ImagenProducto) =>
  Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order;

/**
 * Foto que representa una linea de venta. Primero la foto exacta que se
 * vendio (image_id, aunque ya este marcada como vendida); si la linea no la
 * guardo (ventas anteriores a la seleccion de estampado) o la foto ya no
 * existe, cae a la primera foto de la variante y, por ultimo, a la del
 * producto. El respaldo es solo para mostrar: no se guarda ni marca nada.
 */
export function urlImagenDeLinea(
  linea: LineaVenta,
  imagenes: ImagenProducto[],
): string | null {
  const exacta = linea.image_id
    ? imagenes.find((img) => img.id === linea.image_id)
    : undefined;
  if (exacta) return exacta.url;

  const delProducto = imagenes.filter((img) => img.product_id === linea.product_id);
  const deLaVariante = linea.variant_id
    ? delProducto.filter((img) => img.variant_id === linea.variant_id).sort(porOrden)
    : [];
  if (deLaVariante[0]) return deLaVariante[0].url;

  const sinVariante = delProducto.filter((img) => img.variant_id === null).sort(porOrden);
  return (sinVariante[0] ?? [...delProducto].sort(porOrden)[0])?.url ?? null;
}
