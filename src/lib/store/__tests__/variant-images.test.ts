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
  it("muestra las imagenes de la variante actual primero, luego las de otras variantes, luego las generales", () => {
    const resultado = getImagesForVariant(todas, "v-m");
    expect(resultado).toEqual([...deM, ...deL, ...generales]);
  });

  it("muestra las imagenes de otras variantes seguidas de las generales si la variante seleccionada no tiene imagenes propias", () => {
    const resultado = getImagesForVariant(todas, "v-sin-fotos");
    expect(resultado).toEqual([...deM, ...deL, ...generales]);
  });

  it("muestra solo las generales si la variante no tiene imagenes propias y no hay otras variantes con imagenes", () => {
    expect(getImagesForVariant(generales, "v-sin-fotos")).toEqual(generales);
  });

  it("muestra las imagenes de todas las variantes seguidas de las generales si no hay variante seleccionada", () => {
    const resultado = getImagesForVariant(todas, null);
    expect(resultado).toEqual([...deM, ...deL, ...generales]);
  });
});
