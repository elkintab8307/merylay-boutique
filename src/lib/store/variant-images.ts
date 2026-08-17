export type ImagenProducto = {
  url: string;
  alt: string | null;
  variantId: string | null;
};

export function getImagesForVariant(
  images: ImagenProducto[],
  variantId: string | null,
): ImagenProducto[] {
  const deVarianteActual = variantId ? images.filter((img) => img.variantId === variantId) : [];
  const deOtrasVariantes = images.filter(
    (img) => img.variantId !== null && img.variantId !== variantId,
  );
  const generales = images.filter((img) => img.variantId === null);
  return [...deVarianteActual, ...deOtrasVariantes, ...generales];
}
