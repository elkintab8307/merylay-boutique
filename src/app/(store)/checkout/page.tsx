import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { CheckoutForm } from "./checkout-form";

export default async function CheckoutPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/checkout");
  }

  const { data: cart } = await supabase
    .from("carts")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: cartItems } = cart
    ? await supabase
        .from("cart_items")
        .select("id, product_id, qty, unit_price")
        .eq("cart_id", cart.id)
    : { data: [] };

  if (!cartItems || cartItems.length === 0) {
    redirect("/carrito");
  }

  const productIds = cartItems.map((i) => i.product_id);
  const { data: products } = await supabase
    .from("products")
    .select("id, name")
    .in("id", productIds);
  const productById = new Map((products ?? []).map((p) => [p.id, p.name]));

  const items = cartItems.map((item) => ({
    id: item.id,
    name: productById.get(item.product_id) ?? "Producto",
    qty: item.qty,
    unitPrice: item.unit_price,
  }));
  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-8 font-heading text-3xl text-brand-ciruela">Finalizar compra</h1>
      <div className="mb-8 flex flex-col gap-2 rounded-lg border border-brand-rosa-claro bg-white p-4">
        {items.map((item) => (
          <div key={item.id} className="flex justify-between text-sm text-brand-ciruela">
            <span>
              {item.name} × {item.qty}
            </span>
            <span>{formatPrice(item.unitPrice * item.qty)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-brand-rosa-claro pt-2 font-heading text-brand-rosa">
          <span>Total</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
      </div>
      <CheckoutForm />
    </main>
  );
}
