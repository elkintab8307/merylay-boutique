import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { HeroContenido } from "@/lib/validation/home-contenido";

export function HeroSection({
  hero,
  primerCategoriaSlug,
}: {
  hero: HeroContenido | null;
  primerCategoriaSlug: string | null;
}) {
  const titulo = hero?.titulo || "MeryLay Boutique";
  const subtitulo =
    hero?.subtitulo ||
    "Pijamas y ropa femenina pensadas para ti. Elegancia, comodidad y un toque romántico en cada prenda.";
  const textoBoton = hero?.textoBoton || "Ver la colección";
  const linkBoton =
    hero?.linkBoton || (primerCategoriaSlug ? `/categoria/${primerCategoriaSlug}` : "/");
  const imageUrl = hero?.imageUrl ?? null;

  return (
    <section className="relative flex min-h-[380px] items-center overflow-hidden rounded-2xl">
      {imageUrl ? (
        <Image src={imageUrl} alt={titulo} fill priority className="object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-brand-rosa-claro via-brand-crema to-brand-rosa-medio" />
      )}
      {imageUrl && (
        <div className="absolute inset-0 bg-gradient-to-t from-brand-ciruela/70 via-brand-ciruela/20 to-transparent" />
      )}
      <div
        className={`relative z-10 flex flex-col gap-4 px-8 py-16 sm:px-16 ${
          imageUrl ? "text-brand-crema" : "text-brand-ciruela"
        }`}
      >
        {!hero && <p className="font-script text-3xl text-brand-oro">Bienvenida a</p>}
        <h1 className="font-heading text-4xl font-semibold sm:text-5xl">{titulo}</h1>
        <p className="max-w-md text-lg">{subtitulo}</p>
        <Link href={linkBoton}>
          <Button className="w-fit bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
            {textoBoton}
          </Button>
        </Link>
      </div>
    </section>
  );
}
