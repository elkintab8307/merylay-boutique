import Link from "next/link";
import { PublicLayoutShell } from "@/components/layout/public-layout-shell";

export default function NotFound() {
  return (
    <PublicLayoutShell>
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-6 py-24 text-center">
        <h1 className="font-heading text-3xl text-brand-ciruela">
          Página no encontrada
        </h1>
        <p className="text-brand-ciruela/80">
          Lo sentimos, no encontramos lo que buscas.
        </p>
        <Link
          href="/"
          className="font-body text-sm text-brand-rosa hover:underline"
        >
          Volver a la tienda
        </Link>
      </div>
    </PublicLayoutShell>
  );
}
