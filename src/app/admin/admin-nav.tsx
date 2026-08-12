import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { MobileNavSheet } from "@/components/layout/mobile-nav-sheet";

const ENLACES_BASE = [
  { href: "/admin", label: "Panel" },
  { href: "/pos", label: "POS" },
  { href: "/admin/pedidos", label: "Pedidos" },
  { href: "/admin/categorias", label: "Categorías" },
  { href: "/admin/productos", label: "Productos" },
  { href: "/admin/resenas", label: "Reseñas" },
  { href: "/admin/gastos", label: "Gastos" },
  { href: "/admin/compras", label: "Compras" },
  { href: "/admin/informes", label: "Informes" },
];

export async function AdminNav() {
  const currentUser = await getCurrentProfile();
  const esSuperadmin = currentUser?.profile.role === "superadmin";
  const enlaces = esSuperadmin
    ? [...ENLACES_BASE, { href: "/superadmin/usuarios", label: "Superadmin" }]
    : ENLACES_BASE;

  return (
    <nav className="flex items-center gap-4 border-b border-brand-rosa-claro bg-white px-6 py-3 font-body text-sm text-brand-ciruela">
      <div className="md:hidden">
        <MobileNavSheet links={enlaces} />
      </div>
      <div className="hidden gap-4 md:flex">
        {enlaces.map((enlace) => (
          <Link
            key={enlace.href}
            href={enlace.href}
            className="hover:text-brand-rosa"
          >
            {enlace.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
