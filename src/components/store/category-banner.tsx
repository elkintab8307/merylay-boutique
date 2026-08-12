import Image from "next/image";

export function CategoryBanner({
  name,
  description,
  imageUrl,
}: {
  name: string;
  description: string | null;
  imageUrl: string | null;
}) {
  return (
    <section className="relative flex min-h-[180px] items-center overflow-hidden rounded-2xl">
      {imageUrl ? (
        <Image src={imageUrl} alt="" fill priority className="object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-brand-rosa-claro via-brand-crema to-brand-rosa-medio" />
      )}
      {imageUrl && (
        <div className="absolute inset-0 bg-gradient-to-t from-brand-ciruela/70 via-brand-ciruela/20 to-transparent" />
      )}
      <div
        className={`relative z-10 flex flex-col gap-2 px-8 py-10 ${
          imageUrl ? "text-brand-crema" : "text-brand-ciruela"
        }`}
      >
        <h1 className="font-heading text-3xl font-semibold sm:text-4xl">{name}</h1>
        {description && <p className="max-w-xl text-sm sm:text-base">{description}</p>}
      </div>
    </section>
  );
}
