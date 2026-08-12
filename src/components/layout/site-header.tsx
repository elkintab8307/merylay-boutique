import Image from "next/image";
import Link from "next/link";
import { Search, ShoppingBag } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { createClient } from "@/lib/supabase/server";
import { CartBadge } from "@/components/store/cart-badge";
import { SiteMenuSheet } from "./site-menu-sheet";

export async function SiteHeader() {
  const supabase = await createClient();
  const [currentUser, { data: categorias }, { data: productosActivos }, { data: settingsRows }] =
    await Promise.all([
      getCurrentProfile(),
      supabase
        .from("categories")
        .select("id, name, slug")
        .eq("is_active", true)
        .order("sort_order"),
      supabase.from("products").select("category_id").eq("is_active", true),
      supabase
        .from("store_settings")
        .select("key, value")
        .in("key", [
          "nombre_tienda",
          "redes_instagram",
          "redes_facebook",
          "redes_tiktok",
          "redes_whatsapp",
        ]),
    ]);

  const conteoPorCategoria = new Map<string, number>();
  for (const producto of productosActivos ?? []) {
    if (!producto.category_id) continue;
    conteoPorCategoria.set(
      producto.category_id,
      (conteoPorCategoria.get(producto.category_id) ?? 0) + 1,
    );
  }
  const totalProductos = (productosActivos ?? []).length;

  let cartInitialCount = 0;
  if (currentUser) {
    const { data: cart } = await supabase
      .from("carts")
      .select("id")
      .eq("user_id", currentUser.id)
      .maybeSingle();
    if (cart) {
      const { data: items } = await supabase
        .from("cart_items")
        .select("qty")
        .eq("cart_id", cart.id);
      cartInitialCount = (items ?? []).reduce((sum, i) => sum + i.qty, 0);
    }
  }

  const settingsByKey = new Map((settingsRows ?? []).map((r) => [r.key, r.value]));
  const nombreTienda = String(settingsByKey.get("nombre_tienda") ?? "MeryLay Boutique");
  const redesWhatsapp = settingsByKey.get("redes_whatsapp");
  const redesInstagram = settingsByKey.get("redes_instagram");
  const redesTiktok = settingsByKey.get("redes_tiktok");
  const redesFacebook = settingsByKey.get("redes_facebook");

  return (
    <header className="sticky top-0 z-40 border-b border-brand-rosa-claro bg-brand-crema/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/brand/logo-principal.png"
            alt={nombreTienda}
            width={36}
            height={36}
            className="rounded-full"
          />
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href="/productos"
            aria-label="Buscar productos"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-brand-ciruela hover:bg-brand-rosa-claro/30"
          >
            <Search className="h-5 w-5" />
          </Link>
          <Link
            href="/carrito"
            aria-label="Ver carrito"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-brand-ciruela hover:bg-brand-rosa-claro/30"
          >
            <ShoppingBag className="h-5 w-5" />
            <CartBadge initialCount={cartInitialCount} currentUserId={currentUser?.id ?? null} />
          </Link>
          <SiteMenuSheet
            nombreTienda={nombreTienda}
            currentUser={currentUser}
            categorias={(categorias ?? []).map((c) => ({
              id: c.id,
              name: c.name,
              slug: c.slug,
              count: conteoPorCategoria.get(c.id) ?? 0,
            }))}
            totalProductos={totalProductos}
            redes={{
              whatsapp: redesWhatsapp ? String(redesWhatsapp) : null,
              instagram: redesInstagram ? String(redesInstagram) : null,
              tiktok: redesTiktok ? String(redesTiktok) : null,
              facebook: redesFacebook ? String(redesFacebook) : null,
            }}
          />
        </div>
      </div>
    </header>
  );
}
