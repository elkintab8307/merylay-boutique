import Link from "next/link";
import { redirect } from "next/navigation";
import { vincularClientePortal } from "@/app/pos/customer-actions";

export default async function ClientePortalPage({
  params,
}: PageProps<"/pos/clientes/portal/[profileId]">) {
  const { profileId } = await params;
  const resultado = await vincularClientePortal(profileId);

  if (resultado.cliente) {
    redirect(`/pos/clientes/${resultado.cliente.id}`);
  }

  return (
    <div className="mx-auto max-w-md px-6 py-12 text-center">
      <p className="mb-4 text-brand-ciruela">
        {resultado.error ?? "No se pudo vincular este cliente del portal."}
      </p>
      <Link href="/pos/clientes" className="text-brand-rosa hover:underline">
        Volver a clientes
      </Link>
    </div>
  );
}
