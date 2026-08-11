import { Truck, ShieldCheck, RefreshCw, Heart } from "lucide-react";

const BENEFICIOS = [
  { Icono: Truck, texto: "Envío a toda Colombia" },
  { Icono: ShieldCheck, texto: "Pago seguro" },
  { Icono: RefreshCw, texto: "Cambios y devoluciones" },
  { Icono: Heart, texto: "Hecha con amor en Colombia" },
];

export function BenefitsBar() {
  return (
    <section className="grid grid-cols-2 gap-6 rounded-2xl border border-brand-rosa-claro bg-white py-6 sm:grid-cols-4">
      {BENEFICIOS.map(({ Icono, texto }) => (
        <div key={texto} className="flex flex-col items-center gap-2 px-4 text-center">
          <Icono className="h-6 w-6 text-brand-rosa" />
          <span className="text-xs text-brand-ciruela">{texto}</span>
        </div>
      ))}
    </section>
  );
}
