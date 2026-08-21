import { Store, Receipt, CreditCard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { buildLowStockItems, obtenerUmbralStockBajo } from "@/lib/admin/low-stock";
import { BackendSidebar, type SidebarSection } from "@/components/admin/backend-sidebar";
import { PosTopBar } from "@/components/pos/pos-top-bar";
import { PosStatusBar } from "@/components/pos/pos-status-bar";

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

export default async function PosAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const [currentUser, umbralStockBajo, { data: productos }, { data: variantes }] =
    await Promise.all([
      getCurrentProfile(),
      obtenerUmbralStockBajo(),
      supabase.from("products").select("id, name, stock").eq("is_active", true),
      supabase.from("product_variants").select("id, product_id, talla, color, stock"),
    ]);

  const idsActivos = new Set((productos ?? []).map((p) => p.id));
  const variantesActivas = (variantes ?? []).filter((v) => idsActivos.has(v.product_id));
  const stockBajo = buildLowStockItems(productos ?? [], variantesActivas, umbralStockBajo);

  const nombreVendedor =
    currentUser?.profile.full_name || currentUser?.profile.username || "Vendedor";
  const rolVendedor = currentUser?.profile.role ?? "staff";

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-brand-crema">
      <BackendSidebar sections={SECTIONS} homeHref="/pos" />
      <div className="flex flex-1 flex-col">
        <PosTopBar
          nombreVendedor={nombreVendedor}
          rolVendedor={rolVendedor}
          stockBajo={stockBajo}
        />
        <main className="flex-1 px-6 py-8">{children}</main>
        <PosStatusBar nombreVendedor={nombreVendedor} />
      </div>
    </div>
  );
}
