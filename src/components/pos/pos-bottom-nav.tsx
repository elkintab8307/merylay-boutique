"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store, Receipt, Users, Package, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

type TabLink = { tipo: "link"; href: string; label: string; icon: typeof Store };
type TabButton = { tipo: "boton"; label: string; icon: typeof Store; onClick: () => void };
type Tab = TabLink | TabButton;

export function PosBottomNav({
  rolVendedor,
  onAbrirMas,
  onAbrirInventario,
}: {
  rolVendedor: string;
  onAbrirMas: () => void;
  onAbrirInventario: () => void;
}) {
  const pathname = usePathname();
  const esAdminOSuperadmin = rolVendedor === "admin" || rolVendedor === "superadmin";

  const tabs: Tab[] = [
    { tipo: "link", href: "/pos", label: "POS", icon: Store },
    { tipo: "link", href: "/pos/ventas", label: "Ventas", icon: Receipt },
    ...(esAdminOSuperadmin
      ? [{ tipo: "boton", label: "Inventario", icon: Package, onClick: onAbrirInventario } as const]
      : []),
    { tipo: "link", href: "/pos/clientes", label: "Clientes", icon: Users },
  ];

  const tabClassName = (active: boolean) =>
    cn(
      "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-md px-1 py-1 text-xs",
      active ? "text-brand-rosa" : "text-brand-ciruela",
    );

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-30 flex items-center border-t border-brand-rosa-claro bg-white px-1 py-1.5 md:hidden print:hidden"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        if (tab.tipo === "boton") {
          return (
            <button
              key={tab.label}
              type="button"
              onClick={tab.onClick}
              className={tabClassName(false)}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="w-full truncate text-center">{tab.label}</span>
            </button>
          );
        }
        return (
          <Link key={tab.href} href={tab.href} className={tabClassName(pathname === tab.href)}>
            <Icon className="h-5 w-5 shrink-0" />
            <span className="w-full truncate text-center">{tab.label}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onAbrirMas}
        className="flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-md px-1 py-1 text-xs text-brand-ciruela"
      >
        <Menu className="h-5 w-5 shrink-0" />
        <span className="w-full truncate text-center">Más</span>
      </button>
    </nav>
  );
}
