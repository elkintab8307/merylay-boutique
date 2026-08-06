"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { categoriaSchema, type CategoriaInput } from "@/lib/validation/categoria";
import { slugify } from "@/lib/slug";

async function uniqueSlug(baseSlug: string, ignoreId?: string) {
  const supabase = await createClient();
  let candidate = baseSlug;
  let suffix = 1;

  while (true) {
    let query = supabase.from("categories").select("id").eq("slug", candidate);
    if (ignoreId) {
      query = query.neq("id", ignoreId);
    }
    const { data } = await query.maybeSingle();
    if (!data) return candidate;
    suffix += 1;
    candidate = `${baseSlug}-${suffix}`;
  }
}

export async function createCategoria(
  input: CategoriaInput,
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = categoriaSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const slug = await uniqueSlug(slugify(parsed.data.slug || parsed.data.name));

  const { error } = await supabase.from("categories").insert({
    name: parsed.data.name,
    slug,
    description: parsed.data.description || null,
    parent_id: parsed.data.parentId,
    sort_order: parsed.data.sortOrder,
    is_active: parsed.data.isActive,
  });

  if (error) {
    return { error: "No se pudo crear la categoría." };
  }

  revalidatePath("/admin/categorias");
  return {};
}

export async function updateCategoria(
  id: string,
  input: CategoriaInput,
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = categoriaSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const slug = await uniqueSlug(slugify(parsed.data.slug || parsed.data.name), id);

  const { error } = await supabase
    .from("categories")
    .update({
      name: parsed.data.name,
      slug,
      description: parsed.data.description || null,
      parent_id: parsed.data.parentId,
      sort_order: parsed.data.sortOrder,
      is_active: parsed.data.isActive,
    })
    .eq("id", id);

  if (error) {
    return { error: "No se pudo actualizar la categoría." };
  }

  revalidatePath("/admin/categorias");
  return {};
}

export async function toggleCategoriaActiva(
  id: string,
  isActive: boolean,
): Promise<{ error?: string }> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    return { error: "No se pudo actualizar el estado de la categoría." };
  }

  revalidatePath("/admin/categorias");
  return {};
}
