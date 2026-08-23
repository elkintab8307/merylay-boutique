import Link from "next/link";
import { Heart, House, LayoutGrid, ShoppingBag, User } from "lucide-react";
import { getMenuData } from "@/lib/layout/get-menu-data";
import { SiteMenuSheet } from "./site-menu-sheet";

const TAB_CLASS =
  "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-brand-ciruela hover:text-brand-rosa";
const ICON_CLASS = "h-5 w-5";

export async function MobileBottomNav() {
  const { currentUser, categorias, totalProductos, nombreTienda, redes } = await getMenuData();
  const cuentaHref = currentUser ? "/cuenta/pedidos" : "/login";

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-brand-rosa-claro bg-brand-crema/95 backdrop-blur md:hidden">
      <Link href="/" className={TAB_CLASS}>
        <House className={ICON_CLASS} />
        Inicio
      </Link>
      <Link href="/productos" className={TAB_CLASS}>
        <ShoppingBag className={ICON_CLASS} />
        Tienda
      </Link>
      <SiteMenuSheet
        nombreTienda={nombreTienda}
        currentUser={currentUser}
        categorias={categorias}
        totalProductos={totalProductos}
        redes={redes}
        triggerClassName={TAB_CLASS}
        trigger={
          <>
            <LayoutGrid className={ICON_CLASS} />
            Categorías
          </>
        }
      />
      <Link href="/favoritos" className={TAB_CLASS}>
        <Heart className={ICON_CLASS} />
        Favoritos
      </Link>
      <Link href={cuentaHref} className={TAB_CLASS}>
        <User className={ICON_CLASS} />
        Mi cuenta
      </Link>
    </nav>
  );
}
