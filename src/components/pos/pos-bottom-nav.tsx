"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store, Receipt, Users, Package, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

const TAB_POS = { href: "/pos", label: "POS", icon: Store };
const TAB_VENTAS = { href: "/pos/ventas", label: "Ventas", icon: Receipt };
const TAB_CLIENTES = { href: "/pos/clientes", label: "Clientes", icon: Users };
const TAB_INVENTARIO = { href: "/admin/productos", label: "Inventario", icon: Package };

export function PosBottomNav({
  rolVendedor,
  onAbrirMas,
}: {
  rolVendedor: string;
  onAbrirMas: () => void;
}) {
  const pathname = usePathname();
  const esAdminOSuperadmin = rolVendedor === "admin" || rolVendedor === "superadmin";

  const tabs = esAdminOSuperadmin
    ? [TAB_POS, TAB_VENTAS, TAB_INVENTARIO, TAB_CLIENTES]
    : [TAB_POS, TAB_VENTAS, TAB_CLIENTES];

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-brand-rosa-claro bg-white px-2 py-1.5 md:hidden print:hidden"
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-md px-3 py-1 text-xs",
              active ? "text-brand-rosa" : "text-brand-ciruela",
            )}
          >
            <Icon className="h-5 w-5" />
            {tab.label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onAbrirMas}
        className="flex flex-col items-center gap-0.5 rounded-md px-3 py-1 text-xs text-brand-ciruela"
      >
        <Menu className="h-5 w-5" />
        Más
      </button>
    </nav>
  );
}
