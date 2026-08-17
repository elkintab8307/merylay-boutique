import { BackendSidebar, type SidebarSection } from "@/components/admin/backend-sidebar";

const SECTIONS: SidebarSection[] = [
  {
    label: "POS",
    items: [
      { href: "/pos", label: "Terminal" },
      { href: "/pos/ventas", label: "Ventas POS" },
    ],
  },
];

export default function PosAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-brand-crema">
      <BackendSidebar sections={SECTIONS} homeHref="/admin" />
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
