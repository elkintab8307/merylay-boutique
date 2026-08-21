"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export function PrintButton({ autoImprimir = false }: { autoImprimir?: boolean }) {
  useEffect(() => {
    if (autoImprimir) {
      window.print();
    }
  }, [autoImprimir]);

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
