import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-current-user";

export type MenuCategoria = { id: string; name: string; slug: string; count: number };
export type MenuRedes = {
  whatsapp: string | null;
  instagram: string | null;
  tiktok: string | null;
  facebook: string | null;
};

export async function getMenuData() {
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

  const settingsByKey = new Map((settingsRows ?? []).map((r) => [r.key, r.value]));
  const nombreTienda = String(settingsByKey.get("nombre_tienda") ?? "MeryLay Boutique");

  const categoriasConConteo: MenuCategoria[] = (categorias ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    count: conteoPorCategoria.get(c.id) ?? 0,
  }));

  const redes: MenuRedes = {
    whatsapp: settingsByKey.get("redes_whatsapp") ? String(settingsByKey.get("redes_whatsapp")) : null,
    instagram: settingsByKey.get("redes_instagram")
      ? String(settingsByKey.get("redes_instagram"))
      : null,
    tiktok: settingsByKey.get("redes_tiktok") ? String(settingsByKey.get("redes_tiktok")) : null,
    facebook: settingsByKey.get("redes_facebook") ? String(settingsByKey.get("redes_facebook")) : null,
  };

  return {
    currentUser,
    categorias: categoriasConConteo,
    totalProductos: (productosActivos ?? []).length,
    nombreTienda,
    redes,
  };
}
