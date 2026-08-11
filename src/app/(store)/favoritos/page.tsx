import { createClient } from "@/lib/supabase/server";
import { GuestFavorites } from "./guest-favorites";
import { AuthenticatedFavorites, type FavoriteItemView } from "./authenticated-favorites";

export default async function FavoritosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="mb-8 font-heading text-3xl text-brand-ciruela">Tus favoritos</h1>
        <GuestFavorites />
      </main>
    );
  }

  const { data: favoritos } = await supabase
    .from("favorites")
    .select("product_id")
    .eq("user_id", user.id);

  const productIds = (favoritos ?? []).map((f) => f.product_id);

  const [{ data: productos }, { data: imagenes }] = await Promise.all([
    productIds.length > 0
      ? supabase.from("products").select("id, name, slug, price").in("id", productIds)
      : Promise.resolve({
          data: [] as { id: string; name: string; slug: string; price: number }[],
        }),
    productIds.length > 0
      ? supabase
          .from("product_images")
          .select("product_id, url")
          .in("product_id", productIds)
          .eq("is_primary", true)
      : Promise.resolve({ data: [] as { product_id: string; url: string }[] }),
  ]);

  const imagenPorProducto = new Map((imagenes ?? []).map((img) => [img.product_id, img.url]));

  const items: FavoriteItemView[] = (productos ?? []).map((p) => ({
    productId: p.id,
    name: p.name,
    slug: p.slug,
    price: p.price,
    imageUrl: imagenPorProducto.get(p.id) ?? null,
  }));

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-8 font-heading text-3xl text-brand-ciruela">Tus favoritos</h1>
      <AuthenticatedFavorites items={items} />
    </main>
  );
}
