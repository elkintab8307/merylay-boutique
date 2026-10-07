import { PDFDocument, StandardFonts } from "pdf-lib";
import { getSupabase } from "../_shared/db.ts";
import type { ItemCarrito } from "../_shared/types.ts";

// Una fila por "unidad pedible": cada variante de un producto con
// variantes, o el producto base si no tiene ninguna. Incluye los ids
// reales (productId/variantId/imageId) para que el modelo pueda copiarlos
// tal cual del texto de resultados al pedir agregar_al_carrito.
export interface ProductoEncontrado {
  productId: string;
  variantId: string | null;
  nombre: string;
  talla: string | null;
  color: string | null;
  precio: number;
  stock: number;
  imageId: string | null;
  fotoUrl: string | null;
}

export interface ProductoParaCarrito {
  productId: string;
  variantId: string | null;
  nombre: string;
  precio: number;
  stock: number;
  imageId: string | null;
}

interface ImagenProducto {
  id: string;
  url: string;
  is_primary: boolean;
  variant_id: string | null;
  vendida: boolean | null;
}

interface VarianteProducto {
  id: string;
  talla: string | null;
  color: string | null;
  price_override: number | null;
  stock: number;
}

// Elige la foto a mostrar/registrar para una variante (o para el producto
// base si variantId es null): primero las fotos propias de esa variante,
// luego las generales (variant_id null); dentro de cada grupo, la
// principal primero. Las fotos marcadas como `vendida` (estampado ya
// vendido) se descartan.
function elegirImagen(imagenes: ImagenProducto[] | null | undefined, variantId: string | null): ImagenProducto | null {
  const disponibles = (imagenes ?? []).filter((img) => !img.vendida);
  const deLaVariante = variantId ? disponibles.filter((img) => img.variant_id === variantId) : [];
  const generales = disponibles.filter((img) => img.variant_id === null);
  for (const grupo of [deLaVariante, generales]) {
    const elegida = grupo.find((img) => img.is_primary) ?? grupo[0];
    if (elegida) return elegida;
  }
  return null;
}

// Escapa los comodines de LIKE (% y _) y el propio caracter de escape (\)
// para que una busqueda con esos caracteres los trate como literales.
function escaparPatronLike(texto: string): string {
  return texto.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function buscarProductos(consulta: string): Promise<ProductoEncontrado[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, price, stock, " +
        "product_variants(id, talla, color, price_override, stock), " +
        "product_images(id, url, is_primary, variant_id, vendida)",
    )
    .eq("is_active", true)
    .ilike("name", `%${escaparPatronLike(consulta)}%`)
    .limit(10);

  if (error || !data) return [];

  const productos = data as unknown as Array<{
    id: string;
    name: string;
    price: number;
    stock: number;
    product_variants: VarianteProducto[] | null;
    product_images: ImagenProducto[] | null;
  }>;

  return productos.flatMap((producto): ProductoEncontrado[] => {
    const variantes = producto.product_variants ?? [];
    if (variantes.length === 0) {
      const imagen = elegirImagen(producto.product_images, null);
      return [{
        productId: producto.id,
        variantId: null,
        nombre: producto.name,
        talla: null,
        color: null,
        precio: producto.price,
        stock: producto.stock,
        imageId: imagen?.id ?? null,
        fotoUrl: imagen?.url ?? null,
      }];
    }
    return variantes.map((variante) => {
      const imagen = elegirImagen(producto.product_images, variante.id);
      return {
        productId: producto.id,
        variantId: variante.id,
        nombre: producto.name,
        talla: variante.talla ?? null,
        color: variante.color ?? null,
        precio: variante.price_override ?? producto.price,
        stock: variante.stock,
        imageId: imagen?.id ?? null,
        fotoUrl: imagen?.url ?? null,
      };
    });
  });
}

// Fuente de verdad para agregar al carrito: nunca se confia en el
// nombre/precio que mande el modelo. Devuelve null si el producto no
// existe o no esta activo, si la variante no pertenece a ese producto, o
// si se pide el producto base de un producto que si tiene variantes
// (en ese caso hay que elegir una variante concreta).
export async function obtenerProductoParaCarrito(
  productId: string,
  variantId: string | null,
): Promise<ProductoParaCarrito | null> {
  const supabase = getSupabase();
  const { data: producto, error } = await supabase
    .from("products")
    .select("id, name, price, stock, product_variants(id), product_images(id, url, is_primary, variant_id, vendida)")
    .eq("id", productId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !producto) return null;
  const p = producto as unknown as {
    id: string;
    name: string;
    price: number;
    stock: number;
    product_variants: { id: string }[] | null;
    product_images: ImagenProducto[] | null;
  };

  if (!variantId) {
    if ((p.product_variants ?? []).length > 0) return null;
    return {
      productId: p.id,
      variantId: null,
      nombre: p.name,
      precio: p.price,
      stock: p.stock,
      imageId: elegirImagen(p.product_images, null)?.id ?? null,
    };
  }

  const { data: variante, error: errorVariante } = await supabase
    .from("product_variants")
    .select("id, name, price_override, stock, product_id")
    .eq("id", variantId)
    .eq("product_id", productId)
    .maybeSingle();

  if (errorVariante || !variante) return null;
  const v = variante as { id: string; name: string; price_override: number | null; stock: number; product_id: string };
  if (v.product_id !== p.id) return null;

  return {
    productId: p.id,
    variantId: v.id,
    nombre: `${p.name} (${v.name})`,
    precio: v.price_override ?? p.price,
    stock: v.stock,
    imageId: elegirImagen(p.product_images, v.id)?.id ?? null,
  };
}

async function pdfDesdeLineas(titulo: string, lineas: string[], total: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const pagina = pdf.addPage([400, 120 + lineas.length * 20]);
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  let y = pagina.getHeight() - 40;
  pagina.drawText(titulo, { x: 20, y, size: 16, font: fuente });
  y -= 30;
  for (const linea of lineas) {
    pagina.drawText(linea, { x: 20, y, size: 11, font: fuente });
    y -= 20;
  }
  pagina.drawText(`Total: $${total.toLocaleString("es-CO")}`, { x: 20, y: y - 10, size: 13, font: fuente });
  return pdf.save();
}

async function subirYFirmar(bytes: Uint8Array, nombreArchivo: string): Promise<string> {
  const supabase = getSupabase();
  const ruta = `${crypto.randomUUID()}-${nombreArchivo}`;

  const { error: errorSubida } = await supabase.storage
    .from("whatsapp-docs")
    .upload(ruta, bytes, { contentType: "application/pdf" });
  if (errorSubida) {
    throw new Error(`No se pudo subir el PDF ${nombreArchivo}: ${errorSubida.message}`);
  }

  const { data, error } = await supabase.storage.from("whatsapp-docs").createSignedUrl(ruta, 600);
  if (error || !data) {
    throw new Error(`No se pudo firmar el link del PDF ${nombreArchivo}: ${error?.message}`);
  }

  return data.signedUrl;
}

export async function generarCatalogoPdf(): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("products")
    .select("name, price, stock")
    .eq("is_active", true)
    .order("name");

  if (error) {
    throw new Error(`No se pudo consultar los productos para el catalogo: ${error.message}`);
  }

  const lineas = ((data ?? []) as Array<{ name: string; price: number; stock: number }>).map(
    (p) => `${p.name} — $${p.price.toLocaleString("es-CO")} (stock: ${p.stock})`,
  );
  const bytes = await pdfDesdeLineas("Catalogo MeryLay Boutique", lineas, 0);
  return subirYFirmar(bytes, "catalogo.pdf");
}

export async function generarCotizacionPdf(items: ItemCarrito[]): Promise<string> {
  const lineas = items.map(
    (item) => `${item.nameSnapshot} x${item.qty} — $${(item.unitPrice * item.qty).toLocaleString("es-CO")}`,
  );
  const total = items.reduce((suma, item) => suma + item.unitPrice * item.qty, 0);
  const bytes = await pdfDesdeLineas("Cotizacion MeryLay Boutique", lineas, total);
  return subirYFirmar(bytes, "cotizacion.pdf");
}
