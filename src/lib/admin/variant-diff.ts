export type VarianteDiffItem<T> =
  | { tipo: "actualizar"; index: number; id: string; variante: T }
  | { tipo: "crear"; index: number; variante: T };

export type DiffVariantesResult<T> = {
  items: VarianteDiffItem<T>[];
  borrarIds: string[];
};

export function diffVariantes<T extends { id?: string }>(
  variantesFormulario: T[],
  idsExistentes: string[],
): DiffVariantesResult<T> {
  const idsExistentesSet = new Set(idsExistentes);
  const idsEnviados = new Set(
    variantesFormulario
      .map((v) => v.id)
      .filter((id): id is string => Boolean(id)),
  );

  const items: VarianteDiffItem<T>[] = variantesFormulario.map((variante, index) =>
    variante.id && idsExistentesSet.has(variante.id)
      ? { tipo: "actualizar", index, id: variante.id, variante }
      : { tipo: "crear", index, variante },
  );

  const borrarIds = idsExistentes.filter((id) => !idsEnviados.has(id));

  return { items, borrarIds };
}
