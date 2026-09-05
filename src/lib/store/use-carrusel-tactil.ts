"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function siguienteIndice(actual: number, total: number): number {
  if (total <= 1) return 0;
  return (actual + 1) % total;
}

export function indiceDesdeScroll(
  scrollLeft: number,
  anchoSlide: number,
  total: number,
): number {
  if (anchoSlide <= 0 || total <= 0) return 0;
  const i = Math.round(scrollLeft / anchoSlide);
  return Math.min(Math.max(i, 0), total - 1);
}

function reduceMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function useCarruselTactil({
  total,
  autoAvanceMs,
  desfaseInicialMs = 0,
}: {
  total: number;
  autoAvanceMs?: number;
  desfaseInicialMs?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [indice, setIndice] = useState(0);

  // Copia de `indice` en un ref para leerlo desde timers/eventos sin
  // recrear callbacks. Se sincroniza en un efecto (nunca durante el render).
  const indiceRef = useRef(0);
  useEffect(() => {
    indiceRef.current = indice;
  }, [indice]);
  // Tras un irA programatico, ignora los eventos de scroll un rato para
  // que el listener no pelee con la animacion de scrollTo.
  const ignorarScrollHasta = useRef(0);

  const irA = useCallback(
    (i: number, opciones?: { suave?: boolean }) => {
      const objetivo = Math.min(Math.max(i, 0), Math.max(total - 1, 0));
      setIndice(objetivo);
      const el = ref.current;
      if (!el) return;
      const suave = (opciones?.suave ?? true) && !reduceMotion();
      ignorarScrollHasta.current = Date.now() + 500;
      el.scrollTo({
        left: objetivo * el.clientWidth,
        behavior: suave ? "smooth" : "auto",
      });
    },
    [total],
  );

  // Sincroniza `indice` con el scroll del usuario (swipe).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (Date.now() < ignorarScrollHasta.current) return;
        const nuevo = indiceDesdeScroll(el.scrollLeft, el.clientWidth, total);
        if (nuevo !== indiceRef.current) setIndice(nuevo);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [total]);

  // Auto-avance, gateado por viewport + pestana visible + reduced-motion.
  useEffect(() => {
    if (!autoAvanceMs || total <= 1) return;
    const el = ref.current;
    if (!el) return;

    let enViewport = false;
    let intervalo: ReturnType<typeof setInterval> | null = null;
    let arranque: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      if (
        !enViewport ||
        document.visibilityState !== "visible" ||
        reduceMotion()
      ) {
        return;
      }
      irA(siguienteIndice(indiceRef.current, total));
    };

    const io = new IntersectionObserver(
      (entries) => {
        enViewport = entries.some((e) => e.isIntersecting);
      },
      { threshold: 0.5 },
    );
    io.observe(el);

    arranque = setTimeout(() => {
      tick();
      intervalo = setInterval(tick, autoAvanceMs);
    }, autoAvanceMs + desfaseInicialMs);

    const onVis = () => {
      /* el propio tick chequea document.visibilityState */
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      if (arranque) clearTimeout(arranque);
      if (intervalo) clearInterval(intervalo);
    };
  }, [autoAvanceMs, desfaseInicialMs, total, irA]);

  return { ref, indice, irA };
}
