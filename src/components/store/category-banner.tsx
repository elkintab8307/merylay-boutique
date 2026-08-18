import Image from "next/image";

export function CategoryBanner({ imageUrl }: { imageUrl: string | null }) {
  return (
    <section className="relative aspect-[3/1] overflow-hidden rounded-2xl">
      {imageUrl ? (
        <Image src={imageUrl} alt="" fill priority className="object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-brand-rosa-claro via-brand-crema to-brand-rosa-medio" />
      )}
    </section>
  );
}
