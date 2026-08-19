"use client";

import { Star } from "lucide-react";

export function EstrellasInput({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-1" role="group" aria-label="Calificación">
      {[1, 2, 3, 4, 5].map((estrella) => (
        <button
          key={estrella}
          type="button"
          disabled={disabled}
          aria-label={`${estrella} estrella${estrella > 1 ? "s" : ""}`}
          aria-pressed={estrella <= value}
          onClick={() => onChange(estrella)}
          className="disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Star
            className="h-6 w-6 text-brand-oro"
            fill={estrella <= value ? "currentColor" : "none"}
            strokeWidth={1.5}
          />
        </button>
      ))}
    </div>
  );
}
