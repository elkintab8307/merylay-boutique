import Link from "next/link";
import { ChevronDown, Heart, Search, ShoppingBag, User } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CartBadge } from "@/components/store/cart-badge";
import { destinoPorRol } from "@/lib/auth/destino-por-rol";
import { logout } from "@/lib/auth/logout-action";
import { getMenuData } from "@/lib/layout/get-menu-data";
import { SiteMenuSheet } from "./site-menu-sheet";
import { SiteLogo } from "./site-logo";
import { SiteNavLinks } from "./site-nav-links";

export async function SiteHeader() {
  const { currentUser, categorias, totalProductos, nombreTienda, redes } = await getMenuData();

  const supabase = await createClient();
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

  const destino = currentUser ? destinoPorRol(currentUser.profile.role) : null;

  return (
    <header className="border-b border-brand-rosa-claro bg-brand-crema/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <div className="md:hidden">
          <SiteMenuSheet
            nombreTienda={nombreTienda}
            currentUser={currentUser}
            categorias={categorias}
            totalProductos={totalProductos}
            redes={redes}
          />
        </div>

        <Link href="/" className="shrink-0">
          <SiteLogo />
        </Link>

        <SiteNavLinks categorias={categorias} />

        <form
          action="/buscar"
          method="get"
          className="hidden max-w-xs flex-1 items-center md:flex"
        >
          <div className="relative w-full">
            <input
              type="search"
              name="q"
              placeholder="Buscar productos..."
              aria-label="Buscar productos"
              className="w-full rounded-full border border-brand-rosa-claro bg-white px-4 py-2 pr-10 text-sm text-brand-ciruela placeholder:text-brand-ciruela/50 focus:outline-none focus:ring-2 focus:ring-brand-oro"
            />
            <button
              type="submit"
              aria-label="Buscar"
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-brand-ciruela hover:bg-brand-rosa-claro/30"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        </form>

        <div className="ml-auto flex items-center gap-1">
          <Link
            href="/buscar"
            aria-label="Buscar productos"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-brand-ciruela hover:bg-brand-rosa-claro/30 md:hidden"
          >
            <Search className="h-5 w-5" />
          </Link>
          <Link
            href="/favoritos"
            aria-label="Ver favoritos"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-brand-ciruela hover:bg-brand-rosa-claro/30"
          >
            <Heart className="h-5 w-5" />
          </Link>
          <Link
            href="/carrito"
            aria-label="Ver carrito"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-brand-ciruela hover:bg-brand-rosa-claro/30"
          >
            <ShoppingBag className="h-5 w-5" />
            <CartBadge initialCount={cartInitialCount} currentUserId={currentUser?.id ?? null} />
          </Link>

          <details className="group relative hidden md:block">
            <summary className="flex cursor-pointer list-none items-center gap-1 whitespace-nowrap rounded-full px-3 py-2 text-sm text-brand-ciruela hover:bg-brand-rosa-claro/30 [&::-webkit-details-marker]:hidden">
              <User className="h-4 w-4" />
              Mi cuenta
              <ChevronDown className="h-3 w-3 transition group-open:rotate-180" />
            </summary>
            <div className="absolute right-0 z-50 mt-2 flex w-48 flex-col gap-0.5 rounded-lg border border-brand-rosa-claro bg-white p-2 shadow-brand-md">
              {currentUser ? (
                <>
                  {destino && destino !== "/" && (
                    <Link
                      href={destino}
                      className="rounded-md px-3 py-2 text-sm text-brand-ciruela hover:bg-brand-rosa-claro/30"
                    >
                      Panel ({currentUser.profile.username})
                    </Link>
                  )}
                  <Link
                    href="/cuenta/pedidos"
                    className="rounded-md px-3 py-2 text-sm text-brand-ciruela hover:bg-brand-rosa-claro/30"
                  >
                    Mis pedidos
                  </Link>
                  <form action={logout}>
                    <button
                      type="submit"
                      className="w-full rounded-md px-3 py-2 text-left text-sm text-brand-ciruela hover:bg-brand-rosa-claro/30"
                    >
                      Cerrar sesión
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="rounded-md px-3 py-2 text-sm text-brand-ciruela hover:bg-brand-rosa-claro/30"
                  >
                    Iniciar sesión
                  </Link>
                  <Link
                    href="/registro"
                    className="rounded-md px-3 py-2 text-sm text-brand-ciruela hover:bg-brand-rosa-claro/30"
                  >
                    Crear cuenta
                  </Link>
                </>
              )}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
