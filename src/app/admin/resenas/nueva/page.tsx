import { ResenaForm } from "../resena-form";

export default function NuevaResenaPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Nueva reseña</h1>
      <ResenaForm
        defaultValues={{
          customerName: "",
          body: "",
          rating: 5,
          sortOrder: 0,
          isActive: true,
        }}
      />
    </div>
  );
}
