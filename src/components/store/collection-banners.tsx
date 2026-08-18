import Image from "next/image";
import Link from "next/link";
import type { BannerContenido } from "@/lib/validation/home-contenido";

export function CollectionBanners({ banners }: { banners: BannerContenido[] }) {
  if (banners.length === 0) return null;

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {banners.map((banner, index) => (
        <Link
          key={index}
          href={banner.link || "/productos"}
          className="relative flex aspect-[3/2] items-end overflow-hidden rounded-xl shadow-brand-sm transition hover:shadow-brand-md"
        >
          {banner.imageUrl ? (
            <Image
              src={banner.imageUrl}
              alt=""
              fill
              sizes="(min-width: 640px) 50vw, 100vw"
              className="object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-brand-rosa-medio to-brand-oro" />
          )}
          {banner.titulo && (
            <>
              <div className="absolute inset-0 bg-gradient-to-t from-brand-ciruela/70 to-transparent" />
              <span className="relative z-10 p-6 font-heading text-2xl text-brand-crema">
                {banner.titulo}
              </span>
            </>
          )}
        </Link>
      ))}
    </section>
  );
}
