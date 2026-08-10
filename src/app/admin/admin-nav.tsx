import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/get-current-user";

export async function AdminNav() {
  const currentUser = await getCurrentProfile();
  const esSuperadmin = currentUser?.profile.role === "superadmin";

  return (
    <nav className="flex gap-4 border-b border-brand-rosa-claro bg-white px-6 py-3 font-body text-sm text-brand-ciruela">
      <Link href="/admin" className="hover:text-brand-rosa">
        Panel
      </Link>
      <Link href="/admin/pedidos" className="hover:text-brand-rosa">
        Pedidos
      </Link>
      <Link href="/admin/categorias" className="hover:text-brand-rosa">
        Categorías
      </Link>
      <Link href="/admin/productos" className="hover:text-brand-rosa">
        Productos
      </Link>
      <Link href="/admin/gastos" className="hover:text-brand-rosa">
        Gastos
      </Link>
      <Link href="/admin/compras" className="hover:text-brand-rosa">
        Compras
      </Link>
      <Link href="/admin/informes" className="hover:text-brand-rosa">
        Informes
      </Link>
      {esSuperadmin && (
        <Link href="/superadmin/usuarios" className="hover:text-brand-rosa">
          Superadmin
        </Link>
      )}
    </nav>
  );
}
