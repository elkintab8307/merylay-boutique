"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";

export function PosStatusBar({ nombreVendedor }: { nombreVendedor: string }) {
  const [ahora, setAhora] = useState<Date | null>(null);
  const [enLinea, setEnLinea] = useState(true);

  useEffect(() => {
    setAhora(new Date());
    const interval = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setEnLinea(navigator.onLine);
    const handleOnline = () => setEnLinea(true);
    const handleOffline = () => setEnLinea(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <footer className="sticky bottom-0 hidden flex-wrap items-center justify-between gap-3 border-t border-brand-rosa-claro bg-white px-6 py-2 text-xs text-brand-ciruela/80 md:flex print:hidden">
      <span>
        Caja actual: <strong className="text-brand-ciruela">Caja Principal</strong>
      </span>
      <span>
        Vendedor: <strong className="text-brand-ciruela">{nombreVendedor}</strong>
      </span>
      <span>
        {ahora ? ahora.toLocaleDateString("es-CO") : "--"}{" "}
        {ahora ? ahora.toLocaleTimeString("es-CO") : "--"}
      </span>
      <span className="inline-flex items-center gap-1">
        {enLinea ? (
          <Wifi className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <WifiOff className="h-3.5 w-3.5 text-red-600" />
        )}
        {enLinea ? "En línea" : "Sin conexión"}
      </span>
    </footer>
  );
}
