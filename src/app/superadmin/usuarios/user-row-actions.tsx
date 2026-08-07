"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { bloquearUsuario, cambiarRol, reactivarUsuario } from "./actions";

const ROLES_ASIGNABLES = [
  { value: "customer", label: "Cliente" },
  { value: "staff", label: "Staff" },
  { value: "admin", label: "Admin" },
] as const;

export function UserRowActions({
  userId,
  role,
  isBlocked,
  isSelf,
}: {
  userId: string;
  role: string;
  isBlocked: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (role === "superadmin") {
    return <span className="text-brand-ciruela/50">—</span>;
  }

  const handleRoleChange = (nuevoRol: string) => {
    setError(null);
    startTransition(async () => {
      const result = await cambiarRol(userId, nuevoRol);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const handleToggleBloqueo = () => {
    setError(null);
    startTransition(async () => {
      const result = isBlocked
        ? await reactivarUsuario(userId)
        : await bloquearUsuario(userId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <select
          value={role}
          disabled={isPending || isSelf}
          onChange={(e) => handleRoleChange(e.target.value)}
          className="rounded border border-brand-rosa-claro bg-white px-2 py-1 text-sm text-brand-ciruela disabled:opacity-50"
        >
          {ROLES_ASIGNABLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleToggleBloqueo}
          disabled={isPending || isSelf}
          className="text-brand-ciruela/70 hover:text-brand-rosa hover:underline disabled:opacity-50 disabled:hover:no-underline"
        >
          {isBlocked ? "Reactivar" : "Bloquear"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
