import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { UserRowActions } from "./user-row-actions";

const ROL_LABELS: Record<string, string> = {
  superadmin: "SuperAdmin",
  admin: "Admin",
  staff: "Staff",
  customer: "Cliente",
};

export default async function UsuariosPage() {
  const currentUser = await getCurrentProfile();
  const supabase = await createClient();
  const admin = createAdminClient();

  const [{ data: profiles }, { data: authData }] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false }),
    admin.auth.admin.listUsers(),
  ]);

  const bannedById = new Map(
    (authData?.users ?? []).map((u) => [
      u.id,
      Boolean(u.banned_until && new Date(u.banned_until) > new Date()),
    ]),
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Usuarios</h1>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
            <th className="py-2">Usuario</th>
            <th className="py-2">Nombre</th>
            <th className="py-2">Rol</th>
            <th className="py-2">Estado</th>
            <th className="py-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {(profiles ?? []).map((profile) => (
            <tr
              key={profile.id}
              className="border-b border-brand-rosa-claro/50"
            >
              <td className="py-2">{profile.username}</td>
              <td className="py-2 text-brand-ciruela/70">
                {profile.full_name ?? "-"}
              </td>
              <td className="py-2">
                {ROL_LABELS[profile.role] ?? profile.role}
              </td>
              <td className="py-2">
                {bannedById.get(profile.id) ? (
                  <span className="text-red-600">Bloqueado</span>
                ) : (
                  <span className="text-green-700">Activo</span>
                )}
              </td>
              <td className="py-2">
                <UserRowActions
                  userId={profile.id}
                  role={profile.role}
                  isBlocked={bannedById.get(profile.id) ?? false}
                  isSelf={profile.id === currentUser?.id}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
