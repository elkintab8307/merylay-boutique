import { describe, expect, it } from "vitest";
import { urlImagenDeLinea, type ImagenProducto } from "../imagen-linea";

const imagenes: ImagenProducto[] = [
  { id: "i-base-2", product_id: "p1", variant_id: null, url: "base-2.jpg", is_primary: false, sort_order: 2 },
  { id: "i-base-1", product_id: "p1", variant_id: null, url: "base-1.jpg", is_primary: true, sort_order: 1 },
  { id: "i-var-b", product_id: "p1", variant_id: "v1", url: "var-b.jpg", is_primary: false, sort_order: 2 },
  { id: "i-var-a", product_id: "p1", variant_id: "v1", url: "var-a.jpg", is_primary: false, sort_order: 1 },
  { id: "i-otro", product_id: "p2", variant_id: null, url: "otro.jpg", is_primary: true, sort_order: 0 },
];

describe("urlImagenDeLinea", () => {
  it("usa la foto exacta que se vendio (image_id), aunque sea de otra variante", () => {
    const linea = { product_id: "p1", variant_id: "v1", image_id: "i-var-b" };
    expect(urlImagenDeLinea(linea, imagenes)).toBe("var-b.jpg");
  });

  it("sin image_id usa la primera foto de la variante (por sort_order)", () => {
    const linea = { product_id: "p1", variant_id: "v1", image_id: null };
    expect(urlImagenDeLinea(linea, imagenes)).toBe("var-a.jpg");
  });

  it("sin variante usa la foto principal del producto", () => {
    const linea = { product_id: "p1", variant_id: null, image_id: null };
    expect(urlImagenDeLinea(linea, imagenes)).toBe("base-1.jpg");
  });

  it("si la variante no tiene fotos cae a la foto del producto", () => {
    const linea = { product_id: "p1", variant_id: "v-sin-fotos", image_id: null };
    expect(urlImagenDeLinea(linea, imagenes)).toBe("base-1.jpg");
  });

  it("si el image_id ya no existe (foto borrada) cae al respaldo", () => {
    const linea = { product_id: "p1", variant_id: "v1", image_id: "borrada" };
    expect(urlImagenDeLinea(linea, imagenes)).toBe("var-a.jpg");
  });

  it("devuelve null si el producto no tiene ninguna foto", () => {
    const linea = { product_id: "p3", variant_id: null, image_id: null };
    expect(urlImagenDeLinea(linea, imagenes)).toBeNull();
  });
});
