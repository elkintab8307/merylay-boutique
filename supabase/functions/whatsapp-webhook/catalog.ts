import { PDFDocument } from "pdf-lib";
import { getSupabase } from "../_shared/db.ts";
import { COLORES_MARCA, cargarFuentesMarca, cargarLogoMarca, dibujarEncabezado, dibujarPiePagina } from "./pdf-marca.ts";
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
  categoria: string | null;
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

export interface FiltrosCatalogo {
  texto?: string;
  talla?: string;
  color?: string;
  agregadoDesdeDias?: number;
}

export const TOPE_BUSCAR_CATALOGO = 50;

export async function buscarCatalogo(filtros: FiltrosCatalogo): Promise<ProductoEncontrado[]> {
  if (!filtros.texto && !filtros.talla && !filtros.color && !filtros.agregadoDesdeDias) {
    throw new Error("buscarCatalogo requiere al menos un filtro (texto, talla, color o agregadoDesdeDias).");
  }

  const supabase = getSupabase();
  // product_variants!inner: cuando se filtra por talla/color, Postgres solo
  // devuelve las variantes que cumplen el filtro (no todas las del
  // producto) -- exactamente lo que se quiere expandir despues. Sin
  // talla/color no se usa !inner: un producto sin ninguna variante que
  // "coincida" (porque no se esta filtrando por variante) no debe excluirse.
  const variantesEmbed = (filtros.talla || filtros.color)
    ? "product_variants!inner(id, talla, color, price_override, stock)"
    : "product_variants(id, talla, color, price_override, stock)";

  let query = supabase
    .from("products")
    .select(`id, name, price, stock, created_at, categories(name), ${variantesEmbed}, product_images(id, url, is_primary, variant_id, vendida)`)
    .eq("is_active", true);

  if (filtros.talla) query = query.ilike("product_variants.talla", `%${escaparPatronLike(filtros.talla)}%`);
  if (filtros.color) query = query.ilike("product_variants.color", `%${escaparPatronLike(filtros.color)}%`);
  if (filtros.agregadoDesdeDias) {
    const desde = new Date(Date.now() - filtros.agregadoDesdeDias * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte("created_at", desde);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  const productos = data as unknown as Array<{
    id: string;
    name: string;
    price: number;
    stock: number;
    categories: { name: string } | null;
    product_variants: VarianteProducto[] | null;
    product_images: ImagenProducto[] | null;
  }>;

  // El texto se filtra en memoria (no en la consulta) porque PostgREST no
  // compone de forma simple un .or() entre una columna propia (name) y una
  // columna de una tabla relacionada (categories.name) dentro de la misma
  // llamada -- a esta escala de catalogo (decenas de productos activos) el
  // costo es insignificante.
  const filtrados = filtros.texto
    ? productos.filter((p) => coincideTexto(filtros.texto!, p.name, p.categories?.name ?? ""))
    : productos;

  const expandido = filtrados.flatMap((producto): ProductoEncontrado[] => {
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
        categoria: producto.categories?.name ?? null,
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
        categoria: producto.categories?.name ?? null,
      };
    });
  });

  // El .ilike() de arriba es un pre-filtro amplio por substring (reduce
  // cuantas filas trae Postgres antes del join); aqui se aplica la
  // coincidencia EXACTA de talla en memoria, porque "%L%" tambien machea
  // "XL"/"XXL"/"L-XL" (bug real: "talla L" devolvia tambien XL/XXL). No se
  // expande a color -- no hay evidencia de una colision equivalente ahi.
  const porTalla = filtros.talla
    ? expandido.filter((p) => tallaCoincideExacta(p.talla, filtros.talla!))
    : expandido;

  return porTalla.slice(0, TOPE_BUSCAR_CATALOGO);
}

// Coincidencia EXACTA de talla (no substring): "L" no debe encontrar "XL"
// ni "XXL" solo porque la letra "L" aparece dentro de esas cadenas (bug
// real: .ilike("%L%") en la consulta tambien las trae). Las tallas
// compuestas ("L-XL") se tratan como dos tokens separados por "-": "L" SI
// coincide con "L-XL" (es una de sus dos tallas), pero no con "XL" sola.
function tallaCoincideExacta(tallaReal: string | null, busqueda: string): boolean {
  if (!tallaReal) return false;
  const tokens = tallaReal.toLowerCase().split("-").map((t) => t.trim());
  return tokens.includes(busqueda.toLowerCase().trim());
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

// Quita tildes y pasa a minusculas: el dueño escribe desde WhatsApp sin
// acentos casi siempre ("algodon"), pero los nombres reales del catalogo si
// los llevan ("algodón") -- sin esto, ninguna de las dos formas encuentra a
// la otra.
function normalizarTexto(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Quita un plural comun en español de UNA SOLA palabra ("camisetas" ->
// "camiseta", "pantalones" -> "pantalon"). Solo ACORTA, nunca alarga -- ver
// la nota de coincideTexto() sobre por que.
function singularizarPalabra(palabra: string): string {
  if (palabra.endsWith("es") && palabra.length > 4) return palabra.slice(0, -2);
  if (palabra.endsWith("s") && palabra.length > 3) return palabra.slice(0, -1);
  return palabra;
}

// Bug real observado dos veces: (1) los nombres del catalogo estan en
// SINGULAR pero el dueño pregunta en PLURAL, y (2) el dueño escribe sin
// tildes. Exigir que la FRASE COMPLETA fuera un substring literal fallaba en
// ambos casos a la vez cuando la busqueda tiene varias palabras (ej.
// "camisetas algodon licrado": el plural no esta al final de la frase,
// esta a mitad). Ahora se exige que CADA PALABRA de la busqueda
// (normalizada sin tildes, probando tambien su forma singular) aparezca en
// el nombre o la categoria -- tambien normalizados -- en vez de que la
// frase entera sea un unico substring. Solo se intenta singularizar (nunca
// pluralizar) por la misma razon que antes: un singular ya es casi siempre
// prefijo de su plural, asi que alargar arriesgaria falsos positivos no
// observados.
function coincideTexto(textoBusqueda: string, nombre: string, categoria: string): boolean {
  const nombreNorm = normalizarTexto(nombre);
  const categoriaNorm = normalizarTexto(categoria);
  const palabras = normalizarTexto(textoBusqueda).split(/\s+/).filter(Boolean);
  return palabras.every((palabra) => {
    const candidatos = [palabra, singularizarPalabra(palabra)];
    return candidatos.some((c) => nombreNorm.includes(c) || categoriaNorm.includes(c));
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
      // imageId siempre null: este bot de WhatsApp no deja al cliente elegir
      // un estampado/foto especifico (ver migraciones 046/048). Un image_id
      // no nulo en order_items hace que el trigger de confirmacion de Wompi
      // solo marque esa foto como vendida y se salte el descuento normal de
      // stock del producto/variante.
      imageId: null,
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
    // imageId siempre null: ver comentario arriba en la rama sin variante.
    imageId: null,
  };
}

export interface FilaPdf {
  fotoUrl: string | null;
  nombre: string;
  detalle: string;
  precio: number;
  nota?: string;
}

const ALTO_FILA_PDF = 70;
const ANCHO_PAGINA_PDF = 780; // horizontal (landscape) -- mas ancho que alto
const MARGEN_LATERAL_PDF = 24;
const ALTO_PIE_PDF = 30;

export async function generarPdfConFotos(titulo: string, filas: FilaPdf[], total?: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const alturaExtra = total !== undefined ? ALTO_FILA_PDF : 0;
  const altoPagina = 140 + filas.length * ALTO_FILA_PDF + alturaExtra + ALTO_PIE_PDF;
  const pagina = pdf.addPage([ANCHO_PAGINA_PDF, altoPagina]);

  const [fuentes, logo] = await Promise.all([cargarFuentesMarca(pdf), cargarLogoMarca(pdf)]);
  let y = dibujarEncabezado(pagina, { titulo, fuentes, logo, anchoPagina: ANCHO_PAGINA_PDF, altoPagina });

  for (let indiceFila = 0; indiceFila < filas.length; indiceFila++) {
    const fila = filas[indiceFila];
    if (indiceFila % 2 === 1) {
      pagina.drawRectangle({ x: 0, y: y - ALTO_FILA_PDF + 18, width: ANCHO_PAGINA_PDF, height: ALTO_FILA_PDF, color: COLORES_MARCA.rosaClaro });
    }

    let anchoTexto = MARGEN_LATERAL_PDF;
    if (fila.fotoUrl) {
      try {
        const bytes = await fetch(fila.fotoUrl).then((r) => {
          if (!r.ok) throw new Error(`descarga respondio ${r.status}`);
          return r.arrayBuffer();
        });
        const imagen = fila.fotoUrl.toLowerCase().endsWith(".png")
          ? await pdf.embedPng(bytes)
          : await pdf.embedJpg(bytes);
        const alto = 55;
        const ancho = (imagen.width / imagen.height) * alto;
        pagina.drawImage(imagen, { x: MARGEN_LATERAL_PDF, y: y - alto + 12, width: ancho, height: alto });
        anchoTexto = MARGEN_LATERAL_PDF + ancho + 18;
      } catch (error) {
        console.error(`[catalog] No se pudo incrustar la foto de "${fila.nombre}" en el PDF:`, error);
      }
    }
    pagina.drawText(fila.nombre, { x: anchoTexto, y, size: 12, font: fuentes.textoNegrita, color: COLORES_MARCA.ciruela });
    pagina.drawText(
      `${fila.detalle} — $${fila.precio.toLocaleString("es-CO")}${fila.nota ? ` — ${fila.nota}` : ""}`,
      { x: anchoTexto, y: y - 18, size: 10, font: fuentes.texto, color: COLORES_MARCA.ciruela },
    );
    y -= ALTO_FILA_PDF;
  }

  if (total !== undefined) {
    pagina.drawText(`Total: $${total.toLocaleString("es-CO")}`, { x: MARGEN_LATERAL_PDF, y, size: 12, font: fuentes.textoNegrita, color: COLORES_MARCA.dorado });
  }

  dibujarPiePagina(pagina, { fuentes, anchoPagina: ANCHO_PAGINA_PDF });

  return pdf.save();
}

export async function subirYFirmar(bytes: Uint8Array, nombreArchivo: string): Promise<string> {
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

export async function generarCatalogoPdf(filtros?: FiltrosCatalogo): Promise<string> {
  // No basta con comprobar que `filtros` sea un objeto: un llamador (como
  // el caso "generar_catalogo_pdf" de handler.ts) puede mandar siempre
  // {texto, talla, color} aunque el cliente no haya pedido ningun filtro,
  // y ese objeto llega con sus tres campos en undefined. Hay que mirar si
  // ALGUN campo tiene contenido real antes de decidir si se usa
  // buscarCatalogo (que lanza si no recibe ningun filtro) o el catalogo
  // completo.
  const tieneFiltros = Boolean(filtros?.texto || filtros?.talla || filtros?.color);
  const productos = tieneFiltros
    ? await buscarCatalogo(filtros!)
    : await (async () => {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from("products")
          .select("name, price, stock")
          .eq("is_active", true)
          .order("name");
        if (error) {
          throw new Error(`No se pudo consultar los productos para el catalogo: ${error.message}`);
        }
        return ((data ?? []) as Array<{ name: string; price: number; stock: number }>).map((p) => ({
          productId: "", variantId: null, nombre: p.name, talla: null, color: null,
          precio: p.price, stock: p.stock, imageId: null, fotoUrl: null,
        }));
      })();

  const filas: FilaPdf[] = productos.map((p) => ({
    fotoUrl: p.fotoUrl,
    nombre: p.nombre,
    detalle: [p.talla ? `talla ${p.talla}` : null, p.color ? `color ${p.color}` : null].filter(Boolean).join(", ") || "—",
    precio: p.precio,
    nota: `stock: ${p.stock}`,
  }));

  const bytes = await generarPdfConFotos("Catalogo MeryLay Boutique", filas);
  return subirYFirmar(bytes, "catalogo.pdf");
}

// Resuelve la foto principal de un producto/variante con una consulta
// fresca a product_images: ItemCarrito (lo que trae el carrito en sesion)
// no guarda fotoUrl, solo imageId, asi que no hay forma barata de mostrar
// la foto en la cotizacion sin volver a consultar la base de datos.
export async function obtenerFotoPrincipal(productId: string, variantId: string | null): Promise<string | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("product_images")
    .select("id, url, is_primary, variant_id, vendida")
    .eq("product_id", productId);
  if (error || !data) return null;
  const imagen = elegirImagen(data as ImagenProducto[], variantId);
  return imagen?.url ?? null;
}

export async function generarCotizacionPdf(items: ItemCarrito[]): Promise<string> {
  const total = items.reduce((suma, item) => suma + item.unitPrice * item.qty, 0);
  const filas: FilaPdf[] = await Promise.all(items.map(async (item) => ({
    fotoUrl: await obtenerFotoPrincipal(item.productId, item.variantId),
    nombre: item.nameSnapshot,
    detalle: `x${item.qty}`,
    precio: item.unitPrice * item.qty,
  })));
  const bytes = await generarPdfConFotos("Cotizacion MeryLay Boutique", filas, total);
  return subirYFirmar(bytes, "cotizacion.pdf");
}
