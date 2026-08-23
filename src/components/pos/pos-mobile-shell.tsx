"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { BackendSidebar, type SidebarSection } from "@/components/admin/backend-sidebar";
import { PosBottomNav } from "./pos-bottom-nav";
import { NotificacionesStockBajo } from "./notificaciones-stock-bajo";
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

  return (
    <>
      <BackendSidebar
        sections={sections}
        homeHref="/pos"
        open={menuAbierto}
        onOpenChange={setMenuAbierto}
        ocultarTriggerMovil
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
      <PosBottomNav rolVendedor={rolVendedor} onAbrirMas={() => setMenuAbierto(true)} />
    </>
  );
}
