import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-20">
      <h1 className="font-heading text-3xl text-brand-ciruela">
        Iniciar sesión
      </h1>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
