import { BackendSidebar, type SidebarSection } from "@/components/admin/backend-sidebar";

export function SuperadminNav() {
  const sections: SidebarSection[] = [
    {
      label: "Superadmin",
      items: [
        { href: "/admin", label: "Panel" },
        { href: "/superadmin/usuarios", label: "Usuarios" },
        { href: "/superadmin/ajustes", label: "Ajustes" },
      ],
    },
  ];

  return <BackendSidebar sections={sections} homeHref="/admin" />;
}
