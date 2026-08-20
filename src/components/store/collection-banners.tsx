import Image from "next/image";
import Link from "next/link";
import type { BannerContenido } from "@/lib/validation/home-contenido";

export function CollectionBanners({ banners }: { banners: BannerContenido[] }) {
  if (banners.length === 0) return null;

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-brand-rosa-medio to-brand-oro" />
          )}
        </Link>
      ))}
    </section>
  );
}
