"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Package } from "lucide-react";
import { BackendSidebar, type SidebarSection } from "@/components/admin/backend-sidebar";
import { PosBottomNav } from "./pos-bottom-nav";
import { NotificacionesStockBajo } from "./notificaciones-stock-bajo";
import { InventarioPosModal } from "./inventario-pos-modal";
import type { LowStockItem } from "@/lib/admin/low-stock";

export function PosMobileShell({
  sections,
  rolVendedor,
  stockBajo,
}: {
  sections: SidebarSection[];
  rolVendedor: string;
  stockBajo: LowStockItem[];
}) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [inventarioAbierto, setInventarioAbierto] = useState(false);
  const esAdminOSuperadmin = rolVendedor === "admin" || rolVendedor === "superadmin";

  return (
    <>
      <BackendSidebar
        sections={sections}
        homeHref="/pos"
        open={menuAbierto}
        onOpenChange={setMenuAbierto}
        ocultarTriggerMovil
        extraItem={
          esAdminOSuperadmin
            ? {
                label: "Inventario",
                icon: <Package className="h-4 w-4 shrink-0" />,
                onClick: () => setInventarioAbierto(true),
              }
            : undefined
        }
      />
      <header className="flex items-center justify-between border-b border-brand-rosa-claro bg-white px-4 py-3 md:hidden print:hidden">
        <button
          type="button"
          onClick={() => setMenuAbierto(true)}
          aria-label="Menú"
          className="inline-flex items-center justify-center rounded-md p-2 text-brand-ciruela hover:bg-brand-rosa-claro/30"
        >
          <Menu className="h-6 w-6" />
        </button>
        <Link href="/pos" className="font-script text-2xl text-brand-rosa">
          MeryLay
        </Link>
        <NotificacionesStockBajo items={stockBajo} />
      </header>
      <PosBottomNav
        rolVendedor={rolVendedor}
        onAbrirMas={() => setMenuAbierto(true)}
        onAbrirInventario={() => setInventarioAbierto(true)}
      />
      <InventarioPosModal open={inventarioAbierto} onOpenChange={setInventarioAbierto} />
    </>
  );
}
