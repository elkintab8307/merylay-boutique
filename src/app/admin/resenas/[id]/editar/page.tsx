import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResenaForm } from "../../resena-form";

export default async function EditarResenaPage({
  params,
}: PageProps<"/admin/resenas/[id]/editar">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: resena } = await supabase
    .from("reviews")
    .select("*")
    .eq("id", id)
    .single();

  if (!resena) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Editar reseña</h1>
      <ResenaForm
        resenaId={resena.id}
        defaultValues={{
          customerName: resena.customer_name,
          body: resena.body,
          rating: resena.rating,
          sortOrder: resena.sort_order,
          isActive: resena.is_active,
        }}
        imagenActual={resena.image_url}
      />
    </div>
  );
}
