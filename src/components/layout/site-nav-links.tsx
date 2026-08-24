"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

export function SiteNavLinks({
  categorias,
}: {
  categorias: { slug: string; name: string }[];
}) {
  const pathname = usePathname();
  const categoriaActiva = categorias.some((c) => pathname === `/categoria/${c.slug}`);

  const linkClass = (active: boolean) =>
    `shrink-0 whitespace-nowrap border-b-2 pb-0.5 font-body text-sm transition ${
      active
        ? "border-brand-rosa text-brand-rosa"
        : "border-transparent text-brand-ciruela hover:text-brand-rosa"
    }`;

  return (
    <nav className="hidden items-center gap-5 md:flex">
      <Link href="/" className={linkClass(pathname === "/")}>
        Inicio
      </Link>
      <Link href="/productos" className={linkClass(pathname === "/productos")}>
        Tienda
      </Link>
      {categorias.length > 0 && (
        <details className="group relative">
          <summary
            className={`flex cursor-pointer list-none items-center gap-1 whitespace-nowrap border-b-2 pb-0.5 font-body text-sm [&::-webkit-details-marker]:hidden ${
              categoriaActiva
                ? "border-brand-rosa text-brand-rosa"
                : "border-transparent text-brand-ciruela hover:text-brand-rosa"
            }`}
          >
            Categorías
            <ChevronDown className="h-3 w-3 transition group-open:rotate-180" />
          </summary>
          <div className="absolute left-0 z-50 mt-2 flex max-h-80 w-56 flex-col gap-0.5 overflow-y-auto rounded-lg border border-brand-rosa-claro bg-white p-2 shadow-brand-md">
            {categorias.map((categoria) => (
              <Link
                key={categoria.slug}
                href={`/categoria/${categoria.slug}`}
                className={`rounded-md px-3 py-2 text-sm ${
                  pathname === `/categoria/${categoria.slug}`
                    ? "bg-brand-rosa-claro/40 text-brand-rosa"
                    : "text-brand-ciruela hover:bg-brand-rosa-claro/30"
                }`}
              >
                {categoria.name}
              </Link>
            ))}
          </div>
        </details>
      )}
      <Link href="/promociones" className={linkClass(pathname === "/promociones")}>
        Ofertas
      </Link>
    </nav>
  );
}
