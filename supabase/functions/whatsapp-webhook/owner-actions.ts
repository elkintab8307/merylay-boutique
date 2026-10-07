import { getSupabase } from "../_shared/db.ts";

const formatoMoneda = (valor: number) => `$${valor.toLocaleString("es-CO")}`;

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
  const { data } = await supabase
    .from("profiles")
    .select("full_name, whatsapp, username")
    .or(`full_name.ilike.%${consulta}%,whatsapp.ilike.%${consulta}%`)
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
    .or(`id.eq.${numeroOId},order_number.eq.${numeroOId}`)
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
    .or(`name.ilike.%${consulta}%,sku.eq.${consulta}`)
    .limit(5);

  const filas = (data ?? []) as { name: string; price: number; stock: number; sku: string }[];
  if (filas.length === 0) return `No encontre ningun producto que coincida con "${consulta}".`;
  return filas.map((p) => `${p.name} (${p.sku}): ${formatoMoneda(p.price)}, stock ${p.stock}`).join("\n");
}

export async function actualizarPrecioProducto(idOSku: string, nuevoPrecio: number): Promise<string> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("products")
    .update({ price: nuevoPrecio })
    .or(`id.eq.${idOSku},sku.eq.${idOSku}`);

  if (error) throw new Error(`No se pudo actualizar el precio: ${error.message}`);
  return `Precio actualizado a ${formatoMoneda(nuevoPrecio)}.`;
}

export async function actualizarStock(idOSku: string, nuevoStock: number): Promise<string> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("products")
    .update({ stock: nuevoStock })
    .or(`id.eq.${idOSku},sku.eq.${idOSku}`);

  if (error) throw new Error(`No se pudo actualizar el stock: ${error.message}`);
  return `Stock actualizado a ${nuevoStock} unidades.`;
}

export async function cambiarEstadoPedido(numeroPedido: string, nuevoEstado: string): Promise<string> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("orders")
    .update({ status: nuevoEstado })
    .eq("order_number", numeroPedido);

  if (error) throw new Error(`No se pudo cambiar el estado del pedido: ${error.message}`);
  return `Pedido ${numeroPedido} actualizado a "${nuevoEstado}".`;
}

export async function activarODesactivarProducto(idOSku: string, activo: boolean): Promise<string> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("products")
    .update({ is_active: activo })
    .or(`id.eq.${idOSku},sku.eq.${idOSku}`);

  if (error) throw new Error(`No se pudo ${activo ? "activar" : "desactivar"} el producto: ${error.message}`);
  return `Producto ${activo ? "activado" : "desactivado"}.`;
}

export const ACCIONES_ESCRITURA: ReadonlySet<string> = new Set([
  "actualizar_precio_producto",
  "actualizar_stock",
  "cambiar_estado_pedido",
  "activar_o_desactivar_producto",
]);
