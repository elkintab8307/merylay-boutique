import { getSupabase } from "../_shared/db.ts";

const formatoMoneda = (valor: number) => `$${valor.toLocaleString("es-CO")}`;

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
function escaparValorFiltro(valor: string): string {
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

export async function consultarVentas(dias: number): Promise<string> {
  const supabase = getSupabase();
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("orders")
    .select("total")
    .gte("created_at", desde)
    .eq("status", "pagado");

  const total = ((data ?? []) as { total: number }[]).reduce((suma, o) => suma + o.total, 0);
  return `Ventas de los ultimos ${dias} dias: ${formatoMoneda(total)} (${data?.length ?? 0} pedidos pagados).`;
}

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

export async function consultarProducto(consulta: string): Promise<string> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("products")
    .select("name, price, stock, sku")
    .or(`name.ilike.${escaparValorFiltro(`%${consulta}%`)},sku.eq.${escaparValorFiltro(consulta)}`)
    .limit(5);

  const filas = (data ?? []) as { name: string; price: number; stock: number; sku: string }[];
  if (filas.length === 0) return `No encontre ningun producto que coincida con "${consulta}".`;
  return filas.map((p) => `${p.name} (${p.sku}): ${formatoMoneda(p.price)}, stock ${p.stock}`).join("\n");
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
