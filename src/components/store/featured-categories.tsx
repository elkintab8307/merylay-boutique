import Image from "next/image";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";

export type CategoriaDestacada = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
};

export function FeaturedCategories({ categorias }: { categorias: CategoriaDestacada[] }) {
  return (
    <section className="flex flex-col items-center gap-4">
      <div className="flex flex-wrap justify-center gap-6">
        <Link href="/productos" className="flex flex-col items-center gap-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-rosa text-brand-crema shadow-brand-sm transition hover:shadow-brand-md">
            <LayoutGrid className="h-6 w-6" />
          </div>
          <span className="text-xs text-brand-ciruela">Ver todo</span>
        </Link>
        {categorias.map((categoria) => (
          <Link
            key={categoria.id}
            href={`/categoria/${categoria.slug}`}
            className="flex flex-col items-center gap-2"
          >
            <div className="relative h-16 w-16 overflow-hidden rounded-full shadow-brand-sm transition hover:shadow-brand-md">
              {categoria.imageUrl ? (
                <Image src={categoria.imageUrl} alt="" fill className="object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-rosa to-brand-oro font-heading text-lg text-brand-crema">
                  {categoria.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <span className="text-xs text-brand-ciruela">{categoria.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
