export type ImagenTarjeta = {
  url: string;
  sortOrder: number;
  isPrimary: boolean;
  vendida: boolean;
};

const MAX_IMAGENES_TARJETA = 5;

/**
 * Ordena las fotos de un producto para la mini galeria de la tarjeta del
 * catalogo: la primaria primero, luego por sort_order, sin las unidades
 * ya vendidas, y como maximo 5 (para no cargar 20 estampados por tarjeta).
 */
export function ordenarImagenesTarjeta(imagenes: ImagenTarjeta[]): string[] {
  return imagenes
    .filter((img) => !img.vendida)
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    })
    .slice(0, MAX_IMAGENES_TARJETA)
    .map((img) => img.url);
}
