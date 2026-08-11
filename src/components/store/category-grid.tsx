import Image from "next/image";
import Link from "next/link";

export type CategoriaGridItem = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
};

export function CategoryGrid({ categorias }: { categorias: CategoriaGridItem[] }) {
  if (categorias.length === 0) return null;

  return (
    <section className="flex flex-col gap-6">
      <h2 className="font-heading text-2xl text-brand-ciruela">Compra por categoría</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {categorias.map((categoria) => (
          <Link
            key={categoria.id}
            href={`/categoria/${categoria.slug}`}
            className="relative flex h-40 items-center justify-center overflow-hidden rounded-xl text-center shadow-brand-sm transition hover:shadow-brand-md"
          >
            {categoria.imageUrl ? (
              <Image src={categoria.imageUrl} alt="" fill className="object-cover" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-brand-rosa to-brand-oro" />
            )}
            <div className="absolute inset-0 bg-brand-ciruela/50" />
            <span className="relative z-10 font-heading text-lg text-brand-crema">
              {categoria.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
