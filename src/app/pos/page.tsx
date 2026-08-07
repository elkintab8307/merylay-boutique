import { PosTerminal } from "./pos-terminal";

export default function PosPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="mb-8 font-heading text-3xl text-brand-ciruela">Punto de venta</h1>
      <PosTerminal />
    </main>
  );
}
