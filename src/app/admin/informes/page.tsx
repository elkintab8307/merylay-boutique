import Link from "next/link";
import {
  AlertTriangle,
  CreditCard,
  Package,
  PiggyBank,
  Receipt,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";

const INFORMES = [
  {
    href: "/admin/informes/ventas",
    titulo: "Ventas",
    descripcion: "Tienda y POS combinados, por periodo.",
    Icono: TrendingUp,
  },
  {
    href: "/admin/informes/productos",
    titulo: "Productos más vendidos",
    descripcion: "Top productos por unidades e ingreso.",
    Icono: Package,
  },
  {
    href: "/admin/informes/stock-bajo",
    titulo: "Stock bajo",
    descripcion: "Productos y variantes con pocas unidades.",
    Icono: AlertTriangle,
  },
  {
    href: "/admin/informes/metodos-pago",
    titulo: "Métodos de pago",
    descripcion: "Ingreso por método, ambos canales.",
    Icono: CreditCard,
  },
  {
    href: "/admin/informes/gastos",
    titulo: "Gastos",
    descripcion: "Gastos por categoría y periodo.",
    Icono: Receipt,
  },
  {
    href: "/admin/informes/compras",
    titulo: "Compras",
    descripcion: "Compras por proveedor y periodo.",
    Icono: ShoppingCart,
  },
  {
    href: "/admin/informes/ganancia",
    titulo: "Ganancia real",
    descripcion: "Ventas menos costo de productos y gastos.",
    Icono: PiggyBank,
  },
];

export default function InformesPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Informes</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {INFORMES.map(({ href, titulo, descripcion, Icono }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col gap-2 rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm hover:border-brand-rosa hover:shadow-brand-md"
          >
            <Icono className="h-6 w-6 text-brand-rosa" />
            <p className="font-heading text-lg text-brand-ciruela">
              {titulo}
            </p>
            <p className="text-sm text-brand-ciruela/70">{descripcion}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
