"use client";

import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button
      type="button"
      onClick={() => window.print()}
      className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90 print:hidden"
    >
      Imprimir
    </Button>
  );
}
