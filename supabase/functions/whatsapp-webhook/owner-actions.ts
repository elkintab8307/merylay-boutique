import { getSupabase } from "../_shared/db.ts";
import { buscarCatalogo, construirTarjetasProductos, subirYFirmar, TOPE_BUSCAR_CATALOGO, type FiltrosCatalogo } from "./catalog.ts";
import { generarPdfTabla, generarPdfTarjetas } from "./pdf-render.ts";

export const formatoMoneda = (valor: number) => `$${valor.toLocaleString("es-CO")}`;

// Los valores interpolados en un filtro .or() de PostgREST vienen, en
// ultima instancia, de un mensaje de WhatsApp interpretado por un LLM
// (consulta) y se ejecutan con el cliente de service_role (sin RLS).
// PostgREST trata comas, puntos y parentesis como separadores de su
// sintaxis de filtros, asi que un valor con una coma podria inyectar una
// clausula adicional al .or(). Envolver el valor en comillas dobles hace
// que PostgREST lo trate como un unico literal, sin partirlo por las
// comas que contenga. Dentro del literal se escapa primero la barra
// invertida y DESPUES las comillas: al reves, un valor con \ y " a la
// vez desincronizaria el escape.
export function escaparValorFiltro(valor: string): string {
  return `"${valor.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// products.id y orders.id son uuid: un .or("id.eq.X,sku.eq.X") con un X
// que no sea uuid hace que Postgres rechace TODA la expresion ("invalid
// input syntax for type uuid"), y el error terminaba tratado como "no
// encontrado". Por eso se decide la columna antes de consultar y se
// filtra con un unico .eq() (que ademas no necesita escaparValorFiltro:
// .eq() no se parsea como expresion de filtros).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function columnaProducto(idOSku: string): "id" | "sku" {
  return UUID_RE.test(idOSku) ? "id" : "sku";
}

const noEncontreProducto = (idOSku: string) => `No encontré ningún producto con id/sku ${idOSku}.`;

// Mismo criterio que los informes (migracion 018_informes.sql): un pedido
// enviado o entregado ya fue pagado, tambien cuenta como venta.
export const ESTADOS_PEDIDO_VENDIDO = ["pagado", "enviado", "entregado"];

export async function consultarStockBajo(umbral: number): Promise<string> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("products")
    .select("name, stock")
    .eq("is_active", true)
    .lt("stock", umbral);

  const filas = (data ?? []) as { name: string; stock: number }[];
  if (filas.length === 0) return `Ningun producto activo tiene stock por debajo de ${umbral}.`;
  return filas.map((p) => `${p.name}: ${p.stock} unidades`).join("\n");
}

export async function buscarCliente(consulta: string): Promise<string> {
  const supabase = getSupabase();
  const patron = escaparValorFiltro(`%${consulta}%`);
  const { data } = await supabase
    .from("profiles")
    .select("full_name, whatsapp, username")
    .or(`full_name.ilike.${patron},whatsapp.ilike.${patron}`)
    .limit(5);

  const filas = (data ?? []) as { full_name: string | null; whatsapp: string | null; username: string }[];
  if (filas.length === 0) return `No encontre ningun cliente que coincida con "${consulta}".`;
  return filas.map((c) => `${c.full_name ?? c.username} — ${c.whatsapp ?? "sin telefono"}`).join("\n");
}

export async function consultarPedido(numeroOId: string): Promise<string> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("orders")
    .select("order_number, status, total, channel")
    .eq(UUID_RE.test(numeroOId) ? "id" : "order_number", numeroOId)
    .maybeSingle();

  if (!data) return `No encontre ningun pedido "${numeroOId}".`;
  const pedido = data as { order_number: string; status: string; total: number; channel: string };
  return `Pedido ${pedido.order_number} (${pedido.channel}): ${pedido.status}, ${formatoMoneda(pedido.total)}.`;
}

export interface RespuestaLectura {
  texto: string;
  fotos: { url: string; caption: string }[];
  documentos: { link: string; filename: string }[];
}

const TOPE_FOTOS_EN_VIVO = 10;

function caption(p: { nombre: string; talla: string | null; color: string | null; precio: number; stock: number }): string {
  const detalle = [p.talla ? `talla ${p.talla}` : null, p.color ? `color ${p.color}` : null].filter(Boolean).join(", ");
  return `${p.nombre}${detalle ? ` (${detalle})` : ""} — ${formatoMoneda(p.precio)}, stock ${p.stock}`;
}

export type FormatoConsultaProductos = "conteo" | "lista" | "pdf_fotos" | "pdf_tabla";

const TOPE_LISTA_TEXTO = 10;

function detalleVarianteTexto(p: { talla: string | null; color: string | null }): string {
  const detalle = [p.talla ? `talla ${p.talla}` : null, p.color ? `color ${p.color}` : null].filter(Boolean).join(", ");
  return detalle ? ` (${detalle})` : "";
}

export async function consultarProductos(
  filtros: FiltrosCatalogo,
  formato: FormatoConsultaProductos,
  conFotos: boolean,
): Promise<RespuestaLectura> {
  const productos = await buscarCatalogo(filtros);
  if (productos.length === 0) {
    return { texto: `No encontré ningún producto que coincida con esa búsqueda.`, fotos: [], documentos: [] };
  }

  if (formato === "pdf_fotos") {
    return generarInformeProductosPdfFotos(productos);
  }
  if (formato === "pdf_tabla") {
    return generarInformeProductosPdfTabla(productos);
  }

  const productosUnicos = new Set(productos.map((p) => p.productId)).size;
  const totalUnidades = productos.reduce((suma, p) => suma + p.stock, 0);
  // buscarCatalogo tiene un tope interno (TOPE_BUSCAR_CATALOGO filas); si lo
  // alcanzamos exactamente, puede haber mas coincidencias reales de las que
  // se ven.
  const alcanzoElTope = productos.length === TOPE_BUSCAR_CATALOGO;
  const prefijoConteo = alcanzoElTope ? "al menos " : "";
  const avisoTope = alcanzoElTope ? " (alcancé el límite de búsqueda; podría haber más)" : "";

  const fotos = conFotos
    ? productos.slice(0, TOPE_FOTOS_EN_VIVO).filter((p) => p.fotoUrl).map((p) => ({ url: p.fotoUrl as string, caption: caption(p) }))
    : [];

  if (formato === "lista") {
    const lineas = productos.slice(0, TOPE_LISTA_TEXTO).map((p) => `${p.nombre}${detalleVarianteTexto(p)} — ${formatoMoneda(p.precio)}, stock ${p.stock}`);
    const notaTruncada = productos.length > TOPE_LISTA_TEXTO ? `\n… y ${productos.length - TOPE_LISTA_TEXTO} producto(s) más. Pide el informe en PDF para ver todos.` : "";
    const texto = `Encontré ${prefijoConteo}${productosUnicos} producto(s)${avisoTope}:\n${lineas.join("\n")}${notaTruncada}`;
    return { texto, fotos, documentos: [] };
  }

  // formato === "conteo" (default)
  const truncadoFotos = conFotos && productos.length > TOPE_FOTOS_EN_VIVO
    ? ` (mostrando ${TOPE_FOTOS_EN_VIVO} fotos; pide el informe en PDF para ver el resto)`
    : "";
  const texto = `Encontré ${prefijoConteo}${productosUnicos} producto(s) con ${totalUnidades} unidad(es) en stock en total${avisoTope}${truncadoFotos}.`;
  return { texto, fotos, documentos: [] };
}

async function generarInformeProductosPdfFotos(productos: Awaited<ReturnType<typeof buscarCatalogo>>): Promise<RespuestaLectura> {
  const { estadisticas, tarjetas, fotoHero } = construirTarjetasProductos(productos);
  const bytes = await generarPdfTarjetas("INFORME DE PRODUCTOS", "CATÁLOGO MERYLAY BOUTIQUE", fotoHero, estadisticas, tarjetas);
  const link = await subirYFirmar(bytes, "informe.pdf");
  return { texto: "Aquí tienes el informe 📋", fotos: [], documentos: [{ link, filename: "informe-merylay.pdf" }] };
}

async function generarInformeProductosPdfTabla(productos: Awaited<ReturnType<typeof buscarCatalogo>>): Promise<RespuestaLectura> {
  const filasTabla = productos.map((p) => [
    p.nombre,
    [p.talla, p.color].filter(Boolean).join(" / ") || "—",
    p.categoria ?? "—",
    formatoMoneda(p.precio),
    String(p.stock),
  ]);
  const bytes = await generarPdfTabla("Informe de productos — MeryLay Boutique", ["Producto", "Talla/Color", "Categoría", "Precio", "Stock"], filasTabla);
  const link = await subirYFirmar(bytes, "informe-productos.pdf");
  return { texto: "Aquí tienes el informe 📋", fotos: [], documentos: [{ link, filename: "informe-productos-merylay.pdf" }] };
}

export async function actualizarPrecioProducto(idOSku: string, nuevoPrecio: number): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("products")
    .update({ price: nuevoPrecio })
    .eq(columnaProducto(idOSku), idOSku)
    .select("id");

  if (error) throw new Error(`No se pudo actualizar el precio: ${error.message}`);
  if (!data || data.length === 0) return noEncontreProducto(idOSku);
  return `Precio actualizado a ${formatoMoneda(nuevoPrecio)}.`;
}

export async function actualizarStock(idOSku: string, nuevoStock: number): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("products")
    .update({ stock: nuevoStock })
    .eq(columnaProducto(idOSku), idOSku)
    .select("id");

  if (error) throw new Error(`No se pudo actualizar el stock: ${error.message}`);
  if (!data || data.length === 0) return noEncontreProducto(idOSku);
  return `Stock actualizado a ${nuevoStock} unidades.`;
}

export async function cambiarEstadoPedido(numeroPedido: string, nuevoEstado: string): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("orders")
    .update({ status: nuevoEstado })
    .eq("order_number", numeroPedido)
    .select("id");

  if (error) throw new Error(`No se pudo cambiar el estado del pedido: ${error.message}`);
  if (!data || data.length === 0) return `No encontré ningún pedido con número ${numeroPedido}.`;
  return `Pedido ${numeroPedido} actualizado a "${nuevoEstado}".`;
}

export async function activarODesactivarProducto(idOSku: string, activo: boolean): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("products")
    .update({ is_active: activo })
    .eq(columnaProducto(idOSku), idOSku)
    .select("id");

  if (error) throw new Error(`No se pudo ${activo ? "activar" : "desactivar"} el producto: ${error.message}`);
  if (!data || data.length === 0) return noEncontreProducto(idOSku);
  return `Producto ${activo ? "activado" : "desactivado"}.`;
}

export const ACCIONES_ESCRITURA: ReadonlySet<string> = new Set([
  "actualizar_precio_producto",
  "actualizar_stock",
  "cambiar_estado_pedido",
  "activar_o_desactivar_producto",
]);
