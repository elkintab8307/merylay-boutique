export type ImagenProducto = {
  url: string;
  alt: string | null;
  variantId: string | null;
};

export function getImagesForVariant(
  images: ImagenProducto[],
  variantId: string | null,
): ImagenProducto[] {
  const deVariante = variantId ? images.filter((img) => img.variantId === variantId) : [];
  const generales = images.filter((img) => img.variantId === null);
  return [...deVariante, ...generales];
}
