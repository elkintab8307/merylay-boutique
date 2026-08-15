import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { PosTerminal } from "./pos-terminal";

export default async function PosPage() {
  const currentUser = await getCurrentProfile();
  const tieneAccesoAlPanel =
    currentUser?.profile.role === "admin" || currentUser?.profile.role === "superadmin";

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      {tieneAccesoAlPanel && (
        <Link
          href="/admin"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-brand-ciruela hover:text-brand-rosa"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al panel
        </Link>
      )}
      <h1 className="mb-8 font-heading text-3xl text-brand-ciruela">Punto de venta</h1>
      <PosTerminal />
    </main>
  );
}
