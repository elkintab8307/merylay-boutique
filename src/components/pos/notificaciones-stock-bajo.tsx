"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import type { LowStockItem } from "@/lib/admin/low-stock";

export function NotificacionesStockBajo({ items }: { items: LowStockItem[] }) {
  const [open, setOpen] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickFuera = (e: MouseEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickFuera);
    return () => document.removeEventListener("mousedown", handleClickFuera);
  }, [open]);

  return (
    <div ref={contenedorRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notificaciones de stock bajo"
        className="relative rounded-full p-2 text-brand-ciruela hover:bg-brand-rosa-claro/30"
      >
        <Bell className="h-5 w-5" />
        {items.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-rosa px-1 text-[10px] font-medium text-white">
            {items.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-md border border-brand-rosa-claro bg-white p-2 text-sm shadow-brand-md">
          <p className="px-2 py-1 font-heading text-brand-ciruela">Stock bajo</p>
          {items.length === 0 ? (
            <p className="px-2 py-1 text-brand-ciruela/60">Sin alertas de stock.</p>
          ) : (
            <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
              {items.map((item) => (
                <li
                  key={`${item.productId}-${item.variantLabel ?? "base"}`}
                  className="flex justify-between gap-2 rounded px-2 py-1.5 hover:bg-brand-rosa-claro/20"
                >
                  <span className="text-brand-ciruela">
                    {item.productName}
                    {item.variantLabel ? ` (${item.variantLabel})` : ""}
                  </span>
                  <span className="shrink-0 font-medium text-brand-rosa">{item.stock}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
