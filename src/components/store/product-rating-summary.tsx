import { Star } from "lucide-react";

export function ProductRatingSummary({
  promedio,
  total,
}: {
  promedio: number;
  total: number;
}) {
  if (total === 0) {
    return <p className="text-sm text-brand-ciruela/60">Sin calificaciones todavía</p>;
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex" aria-hidden>
        {[1, 2, 3, 4, 5].map((estrella) => (
          <Star
            key={estrella}
            className="h-4 w-4 text-brand-oro"
            fill={estrella <= Math.round(promedio) ? "currentColor" : "none"}
            strokeWidth={1.5}
          />
        ))}
      </div>
      <span className="text-sm text-brand-ciruela/70">
        {promedio.toFixed(1)} ({total} {total === 1 ? "calificación" : "calificaciones"})
      </span>
    </div>
  );
}
