import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { BackendSidebar, type SidebarSection } from "@/components/admin/backend-sidebar";

export async function AdminNav() {
  const currentUser = await getCurrentProfile();
  const esSuperadmin = currentUser?.profile.role === "superadmin";

  const sections: SidebarSection[] = [
    { label: "Inicio", items: [{ href: "/admin", label: "Panel" }] },
    {
      label: "Catálogo",
      items: [
        { href: "/admin/productos", label: "Productos" },
        { href: "/admin/categorias", label: "Categorías" },
      ],
    },
    {
      label: "Ventas",
      items: [
        { href: "/admin/pedidos", label: "Pedidos" },
        { href: "/pos", label: "POS" },
        { href: "/pos/ventas", label: "Ventas POS" },
      ],
    },
    {
      label: "Negocio",
      items: [
        { href: "/admin/resenas", label: "Reseñas" },
        { href: "/admin/gastos", label: "Gastos" },
        { href: "/admin/compras", label: "Compras" },
        { href: "/admin/informes", label: "Informes" },
      ],
    },
  ];

  if (esSuperadmin) {
    sections.push({
      label: "Superadmin",
      items: [{ href: "/superadmin/usuarios", label: "Superadmin" }],
    });
  }

  return <BackendSidebar sections={sections} homeHref="/admin" />;
}
