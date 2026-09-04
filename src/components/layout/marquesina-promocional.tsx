// Marquesina de la franja superior: las frases promocionales se desplazan
// en bucle continuo, igual en PC y en movil. Es CSS puro (sin JS) — la
// animacion vive en globals.css (`--animate-marquesina` / `@keyframes
// marquesina`), siguiendo el mismo patron que `caer-nieve`.
//
// La pista se renderiza DOS veces: la animacion la mueve -50% (justo el
// ancho de una copia), asi el bucle no tiene salto. La segunda copia va
// `aria-hidden` para no repetir el texto a lectores de pantalla.

export const FRASES_PROMOCIONALES_DEFECTO = [
  "Domicilios Gratis en Armenia",
  "Nuevas Colecciones Cada Semana",
  "Estampados Originales y Novedosos",
  "Alta Calidad en Cada Prenda",
] as const;

function Pista({ frases, decorativa }: { frases: string[]; decorativa?: boolean }) {
  return (
    <div
      data-pista
      aria-hidden={decorativa || undefined}
      className="flex shrink-0 items-center"
    >
      {frases.map((frase, i) => (
        <span key={i} className="flex items-center">
          <span data-testid="frase" className="px-5">
            {frase}
          </span>
          <span aria-hidden className="text-brand-oro">
            ♠
          </span>
        </span>
      ))}
    </div>
  );
}

export function MarquesinaPromocional({ frases }: { frases: string[] }) {
  const limpias = frases.map((f) => f.trim()).filter(Boolean);
  const activas = limpias.length > 0 ? limpias : [...FRASES_PROMOCIONALES_DEFECTO];

  return (
    <div className="overflow-hidden bg-brand-ciruela py-2 text-xs font-medium text-brand-crema sm:text-sm">
      <div className="flex w-max animate-marquesina whitespace-nowrap hover:[animation-play-state:paused] motion-reduce:animate-none">
        <Pista frases={activas} />
        <Pista frases={activas} decorativa />
      </div>
    </div>
  );
}
