import type { LowStockItem } from "@/lib/admin/low-stock";
import { ImprimirUltimoReciboButton } from "./imprimir-ultimo-recibo-button";
import { NotificacionesStockBajo } from "./notificaciones-stock-bajo";

const ETIQUETA_ROL: Record<string, string> = {
  staff: "Vendedor/a",
  admin: "Administrador/a",
  superadmin: "Superadmin",
};

export function PosTopBar({
  nombreVendedor,
  rolVendedor,
  stockBajo,
}: {
  nombreVendedor: string;
  rolVendedor: string;
  stockBajo: LowStockItem[];
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-brand-rosa-claro bg-white px-6 py-4 print:hidden">
      <div>
        <h1 className="font-heading text-xl text-brand-ciruela">Punto de Venta</h1>
        <p className="text-sm text-brand-ciruela/70">¡Bienvenida/o, {nombreVendedor}!</p>
      </div>
      <div className="flex items-center gap-3">
        <ImprimirUltimoReciboButton />
        <NotificacionesStockBajo items={stockBajo} />
        <div className="flex items-center gap-2 border-l border-brand-rosa-claro pl-3">
          <span className="text-sm font-medium text-brand-ciruela">{nombreVendedor}</span>
          <span className="text-xs text-brand-ciruela/60">
            {ETIQUETA_ROL[rolVendedor] ?? rolVendedor}
          </span>
        </div>
      </div>
    </header>
  );
}
