import Image from "next/image";
import { Star } from "lucide-react";

export type ReviewItem = {
  id: string;
  customerName: string;
  body: string;
  rating: number;
  imageUrl: string | null;
};

export function ReviewsSection({ resenas }: { resenas: ReviewItem[] }) {
  if (resenas.length === 0) return null;

  return (
    <section className="flex flex-col gap-6">
      <h2 className="font-heading text-2xl text-brand-ciruela">
        Lo que dicen nuestras clientas
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {resenas.map((resena) => (
          <div
            key={resena.id}
            className="flex flex-col gap-3 rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm"
          >
            <div className="flex items-center gap-3">
              {resena.imageUrl ? (
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-brand-rosa-claro">
                  <Image src={resena.imageUrl} alt="" fill className="object-cover" />
                </div>
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-rosa-claro font-heading text-brand-ciruela">
                  {resena.customerName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex flex-col">
                <span className="font-body text-sm text-brand-ciruela">
                  {resena.customerName}
                </span>
                <div
                  className="flex gap-0.5"
                  role="img"
                  aria-label={`${resena.rating} de 5 estrellas`}
                >
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star
                      key={index}
                      className="h-3.5 w-3.5 text-brand-oro"
                      fill={index < resena.rating ? "currentColor" : "none"}
                      strokeWidth={1.5}
                    />
                  ))}
                </div>
              </div>
            </div>
            <p className="text-sm text-brand-ciruela/80">{resena.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
