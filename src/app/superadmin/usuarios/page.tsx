import { requireSuperadmin } from "@/lib/admin/require-superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { UserRowActions } from "./user-row-actions";
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const ROL_LABELS: Record<string, string> = {
  superadmin: "SuperAdmin",
  admin: "Admin",
  staff: "Staff",
  customer: "Cliente",
};

/**
 * Pagina através de todos los usuarios en Supabase Auth.
 * listUsers() solo devuelve los primeros ~50 por defecto,
 * así que iteramos hasta obtener todos.
 */
async function fetchAllAuthUsers(admin: ReturnType<typeof createAdminClient>) {
  const allUsers = [];
  let page = 1;
  const perPage = 1000; // large page size to minimize round trips

  try {
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage,
      });

      if (error) {
        return { users: null, error };
      }

      if (!data?.users || data.users.length === 0) {
        break; // no more pages
      }

      allUsers.push(...data.users);

      // if we got fewer than perPage users, we've reached the end
      if (data.users.length < perPage) {
        break;
      }

      page++;
    }

    return { users: allUsers, error: null };
  } catch {
    return { users: null, error: new Error("Failed to fetch auth users") };
  }
}

export default async function UsuariosPage() {
  // Segunda linea de defensa: no dependemos solo del middleware de src/proxy.ts,
  // porque esta pagina usa el service role y omite RLS.
  const currentUser = await requireSuperadmin();
  const supabase = await createClient();
  const admin = createAdminClient();

  const [{ data: profiles, error: profilesError }, authResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false }),
      fetchAllAuthUsers(admin),
    ]);

  // Check for errors and show error message if any
  if (profilesError) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-2xl text-brand-ciruela">Usuarios</h1>
        <p className="text-red-600">
          No se pudo cargar la lista de usuarios.
        </p>
      </div>
    );
  }

  if (authResult.error) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-2xl text-brand-ciruela">Usuarios</h1>
        <p className="text-red-600">
          No se pudo cargar la lista de usuarios.
        </p>
      </div>
    );
  }

  const bannedById = new Map(
    (authResult.users ?? []).map((u) => [
      u.id,
      Boolean(u.banned_until && new Date(u.banned_until) > new Date()),
    ]),
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Usuarios</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Usuario</TableHeaderCell>
            <TableHeaderCell>Nombre</TableHeaderCell>
            <TableHeaderCell>Rol</TableHeaderCell>
            <TableHeaderCell>Estado</TableHeaderCell>
            <TableHeaderCell>Acciones</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <tbody>
          {(profiles ?? []).map((profile) => (
            <TableRow key={profile.id}>
              <TableCell>{profile.username}</TableCell>
              <TableCell className="text-brand-ciruela/70">{profile.full_name ?? "-"}</TableCell>
              <TableCell>{ROL_LABELS[profile.role] ?? profile.role}</TableCell>
              <TableCell>
                <Badge variant={bannedById.get(profile.id) ? "danger" : "success"}>
                  {bannedById.get(profile.id) ? "Bloqueado" : "Activo"}
                </Badge>
              </TableCell>
              <TableCell>
                <UserRowActions
                  userId={profile.id}
                  role={profile.role}
                  isBlocked={bannedById.get(profile.id) ?? false}
                  isSelf={profile.id === currentUser.id}
                />
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
