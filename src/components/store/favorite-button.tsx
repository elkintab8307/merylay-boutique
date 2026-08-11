"use client";

import { useEffect, useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { addFavorite, removeFavorite } from "@/app/(store)/favoritos/actions";
import {
  getLocalFavorites,
  saveLocalFavorites,
  toggleLocalFavorite,
  isFavorite,
  type LocalFavoriteItem,
} from "@/lib/favorites/local-favorites";

export function FavoriteButton({
  productId,
  currentUserId,
  initialFavorite,
  product,
}: {
  productId: string;
  currentUserId: string | null;
  initialFavorite: boolean;
  product: { slug: string; name: string; price: number; imageUrl: string | null };
}) {
  const [favorito, setFavorito] = useState(initialFavorite);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (currentUserId) return;
    // Un invitado no tiene favoritos en el servidor; el estado real vive
    // en localStorage y solo se conoce tras montar en el navegador.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFavorito(isFavorite(getLocalFavorites(), productId));
  }, [currentUserId, productId]);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (currentUserId) {
      const next = !favorito;
      setFavorito(next);
      startTransition(async () => {
        const result = next ? await addFavorite(productId) : await removeFavorite(productId);
        if (result?.error) setFavorito(!next);
      });
      return;
    }

    const item: LocalFavoriteItem = {
      productId,
      slug: product.slug,
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl,
    };
    const current = getLocalFavorites();
    const next = toggleLocalFavorite(current, item);
    saveLocalFavorites(next);
    setFavorito(isFavorite(next, productId));
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isPending}
      aria-label={favorito ? "Quitar de favoritos" : "Agregar a favoritos"}
      aria-pressed={favorito}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-brand-rosa shadow-brand-sm backdrop-blur transition hover:bg-white disabled:opacity-50"
    >
      <Heart className="h-4 w-4" fill={favorito ? "currentColor" : "none"} />
    </button>
  );
}
