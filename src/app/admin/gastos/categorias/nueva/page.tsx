import { CategoriaGastoForm } from "../categoria-gasto-form";

export default function NuevaCategoriaGastoPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">
        Nueva categoría de gasto
      </h1>
      <CategoriaGastoForm defaultValues={{ name: "", isActive: true }} />
    </div>
  );
}
