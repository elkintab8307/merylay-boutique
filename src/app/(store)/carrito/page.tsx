import { createClient } from "@/lib/supabase/server";
import { GuestCart } from "./guest-cart";
import { AuthenticatedCart, type CartItemView } from "./authenticated-cart";

export default async function CarritoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="mb-8 font-heading text-3xl text-brand-ciruela">Tu carrito</h1>
        <GuestCart />
      </main>
    );
  }

  const { data: cart } = await supabase
    .from("carts")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: cartItems } = cart
    ? await supabase
        .from("cart_items")
        .select("id, product_id, variant_id, qty, unit_price")
        .eq("cart_id", cart.id)
    : { data: [] };

  const productIds = (cartItems ?? []).map((i) => i.product_id);
  const variantIds = (cartItems ?? [])
    .map((i) => i.variant_id)
    .filter((v): v is string => Boolean(v));

  const [{ data: products }, { data: variants }] = await Promise.all([
    productIds.length > 0
      ? supabase.from("products").select("id, name, slug").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; name: string; slug: string }[] }),
    variantIds.length > 0
      ? supabase.from("product_variants").select("id, talla, color").in("id", variantIds)
      : Promise.resolve({ data: [] as { id: string; talla: string | null; color: string | null }[] }),
  ]);

  const productById = new Map((products ?? []).map((p) => [p.id, p]));
  const variantById = new Map((variants ?? []).map((v) => [v.id, v]));

  const items: CartItemView[] = (cartItems ?? []).map((item) => {
    const product = productById.get(item.product_id);
    const variant = item.variant_id ? variantById.get(item.variant_id) : null;
    return {
      id: item.id,
      name: product?.name ?? "Producto",
      slug: product?.slug ?? "",
      variantLabel: variant
        ? [variant.talla, variant.color].filter(Boolean).join(" / ")
        : null,
      qty: item.qty,
      unitPrice: item.unit_price,
    };
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-8 font-heading text-3xl text-brand-ciruela">Tu carrito</h1>
      <AuthenticatedCart items={items} />
    </main>
  );
}
