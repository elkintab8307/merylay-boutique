import { RegistroForm } from "./registro-form";

export default function RegistroPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-20">
      <h1 className="font-heading text-3xl text-brand-ciruela">
        Crea tu cuenta
      </h1>
      <RegistroForm />
    </main>
  );
}
