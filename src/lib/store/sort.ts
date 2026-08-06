export type SortKey = "destacados" | "precio-asc" | "precio-desc" | "recientes";

export function resolveSort(value: string | undefined): {
  key: SortKey;
  column: "is_featured" | "price" | "created_at";
  ascending: boolean;
} {
  switch (value) {
    case "precio-asc":
      return { key: "precio-asc", column: "price", ascending: true };
    case "precio-desc":
      return { key: "precio-desc", column: "price", ascending: false };
    case "recientes":
      return { key: "recientes", column: "created_at", ascending: false };
    default:
      return { key: "destacados", column: "is_featured", ascending: false };
  }
}
