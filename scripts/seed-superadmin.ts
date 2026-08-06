import { config } from "dotenv";
config({ path: ".env.local" });

import { createAdminClient } from "../src/lib/supabase/admin";

const REQUIRED_ENV_VARS = [
  "SUPERADMIN_EMAIL",
  "SUPERADMIN_USERNAME",
  "SUPERADMIN_PASSWORD",
] as const;

function readRequiredEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(
      `Faltan variables de entorno en .env.local: ${missing.join(", ")}`,
    );
    process.exit(1);
  }

  return {
    email: process.env.SUPERADMIN_EMAIL!,
    username: process.env.SUPERADMIN_USERNAME!,
    password: process.env.SUPERADMIN_PASSWORD!,
  };
}

async function getOrCreateAuthUser(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  password: string,
) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!error) {
    return { user: data.user, created: true as const };
  }

  if (!error.message.toLowerCase().includes("already")) {
    throw error;
  }

  const { data: list, error: listError } = await admin.auth.admin.listUsers();
  if (listError) {
    throw listError;
  }

  const existing = list.users.find((u) => u.email === email);
  if (!existing) {
    throw new Error(
      `No se pudo crear ni encontrar el usuario ${email}: ${error.message}`,
    );
  }

  return { user: existing, created: false as const };
}

async function main() {
  const { email, username, password } = readRequiredEnv();
  const admin = createAdminClient();

  const { user, created } = await getOrCreateAuthUser(admin, email, password);

  const { error: updateError } = await admin
    .from("profiles")
    .update({ role: "superadmin", username })
    .eq("id", user.id);

  if (updateError) {
    throw updateError;
  }

  console.log(
    created
      ? `Usuario superadmin creado: ${email} (username: ${username}).`
      : `Usuario superadmin ya existia: ${email} (username: ${username}). Rol confirmado.`,
  );
  console.log(
    "IMPORTANTE: cambia la contraseña del superadmin despues del primer inicio de sesion.",
  );
}

main().catch((error) => {
  console.error("Error al sembrar el superadmin:", error);
  process.exit(1);
});
