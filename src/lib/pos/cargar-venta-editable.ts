import type { createClient } from "@/lib/supabase/server";
import type { LocalCartItem } from "@/lib/cart/local-cart";
import type { ClienteSeleccionado } from "@/app/pos/cliente-selector";
import type { Database } from "@/lib/supabase/database.types";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export type VentaEditable = {
  venta: {
    id: string;
    discount: number;
    payment_method: PaymentMethod;
    customer_id: string | null;
    total: number;
  };
  itemsIniciales: LocalCartItem[];
  cliente: ClienteSeleccionado | null;
  // Suma de los abonos. Solo un credito los tiene; en ventas normales es 0.
  abonado: number;
};

/**
 * Carga lo que necesita la pantalla de "editar venta" (la de Ventas y la de
 * Creditos comparten esto): la venta, sus items listos para el editor, el
 * cliente y, si es un credito, cuanto lleva abonado. Devuelve null si la
 * venta no existe.
 */
export async function cargarVentaEditable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<VentaEditable | null> {
  const { data: venta } = await supabase
    .from("pos_sales")
    .select("id, discount, payment_method, customer_id, total")
    .eq("id", id)
    .single();

  if (!venta) return null;

  // Solo un credito tiene abonos: el saldo es total - abonado (misma
  // definicion que usa registrar_abono_credito en la base de datos).
  const { data: abonos } =
    venta.payment_method === "credito"
      ? await supabase.from("credit_payments").select("amount").eq("sale_id", venta.id)
      : { data: [] as { amount: number }[] };
  const abonado = (abonos ?? []).reduce((suma, abono) => suma + abono.amount, 0);

  const { data: items } = await supabase
    .from("pos_sale_items")
    .select("qty, unit_price, product_id, variant_id, image_id")
    .eq("sale_id", venta.id);

  const productIds = (items ?? [])
    .map((i) => i.product_id)
    .filter((v): v is string => Boolean(v));
  const variantIds = (items ?? [])
    .map((i) => i.variant_id)
    .filter((v): v is string => Boolean(v));

  const [{ data: products }, { data: variants }] = await Promise.all([
    productIds.length > 0
      ? supabase.from("products").select("id, name, stock").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; name: string; stock: number }[] }),
    variantIds.length > 0
      ? supabase.from("product_variants").select("id, talla, color, stock").in("id", variantIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            talla: string | null;
            color: string | null;
            stock: number;
          }[],
        }),
  ]);

  const productById = new Map((products ?? []).map((p) => [p.id, p]));
  const variantById = new Map((variants ?? []).map((v) => [v.id, v]));

  const itemsIniciales: LocalCartItem[] = (items ?? []).map((item) => {
    const producto = item.product_id ? productById.get(item.product_id) : undefined;
    const variante = item.variant_id ? variantById.get(item.variant_id) : undefined;
    const varianteLabel = variante
      ? [variante.talla, variante.color].filter(Boolean).join(" / ")
      : null;
    const nombreBase = producto?.name ?? "Producto";
    // El stock "editable" de una linea ya vendida es el stock actual mas lo
    // que esta venta ya tiene reservado: esa cantidad sigue descontada del
    // stock real hasta que se guarde la edicion, asi que hay que sumarla de
    // vuelta para no subestimar el maximo disponible en el editor.
    const stockActual = variante?.stock ?? producto?.stock ?? 0;

    return {
      productId: item.product_id ?? "",
      variantId: item.variant_id,
      imageId: item.image_id,
      slug: "",
      name: varianteLabel ? `${nombreBase} (${varianteLabel})` : nombreBase,
      unitPrice: item.unit_price,
      qty: item.qty,
      imageUrl: null,
      stock: stockActual + item.qty,
    };
  });

  const { data: cliente } = venta.customer_id
    ? await supabase
        .from("pos_customers")
        .select("id, nombre, telefono")
        .eq("id", venta.customer_id)
        .single()
    : { data: null };

  return { venta, itemsIniciales, cliente, abonado };
}
