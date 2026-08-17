import { describe, expect, it } from "vitest";
import { getImagesForVariant, type ImagenProducto } from "../variant-images";

const generales: ImagenProducto[] = [
  { url: "general-1.jpg", alt: null, variantId: null },
  { url: "general-2.jpg", alt: null, variantId: null },
];
const deM: ImagenProducto[] = [{ url: "m-1.jpg", alt: null, variantId: "v-m" }];
const deL: ImagenProducto[] = [{ url: "l-1.jpg", alt: null, variantId: "v-l" }];
const todas = [...generales, ...deM, ...deL];

describe("getImagesForVariant", () => {
  it("muestra las imagenes de la variante primero, luego las generales", () => {
    expect(getImagesForVariant(todas, "v-m")).toEqual([...deM, ...generales]);
  });

  it("muestra solo las generales si la variante no tiene imagenes propias", () => {
    expect(getImagesForVariant(generales, "v-sin-fotos")).toEqual(generales);
  });

  it("muestra solo las generales si no hay variante seleccionada", () => {
    expect(getImagesForVariant(todas, null)).toEqual(generales);
  });
});
