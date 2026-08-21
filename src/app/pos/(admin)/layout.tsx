import { Store, Receipt, CreditCard } from "lucide-react";
import { BackendSidebar, type SidebarSection } from "@/components/admin/backend-sidebar";

const SECTIONS: SidebarSection[] = [
  {
    label: "POS",
    items: [
      { href: "/pos", label: "Terminal", icon: <Store className="h-4 w-4 shrink-0" /> },
      { href: "/pos/ventas", label: "Ventas POS", icon: <Receipt className="h-4 w-4 shrink-0" /> },
      { href: "/pos/creditos", label: "Créditos", icon: <CreditCard className="h-4 w-4 shrink-0" /> },
    ],
  },
];

export default function PosAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-brand-crema">
      <BackendSidebar sections={SECTIONS} homeHref="/pos" />
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
