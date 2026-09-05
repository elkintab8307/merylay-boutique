# Galería de imágenes en la tienda (tarjeta + lightbox) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En la tienda pública, la tarjeta de producto muestra una mini galería que rota sola y se pasa deslizando; el detalle abre un lightbox a pantalla completa con navegación.

**Architecture:** Un track CSS `scroll-snap` da el swipe nativo. Un hook `useCarruselTactil` añade índice (desde `scrollLeft`) y auto-avance opcional (gateado por viewport / pestaña visible / `prefers-reduced-motion`). `TarjetaGaleria` (tarjeta) y `LightboxImagenes` (detalle) lo usan. `ProductCardData.imageUrl` pasa a `imageUrls: string[]`.

**Tech Stack:** Next.js App Router + React 19 + TypeScript, Tailwind v4, Supabase, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-05-galeria-imagenes-tienda-design.md`

## Global Constraints

- Todo el texto visible en **español**.
- jsdom NO implementa `IntersectionObserver`, `Element.scrollTo/scrollBy`, `scroll-snap` ni scroll real. Los tests mockean esas APIs; la lógica de índice y "siguiente" vive en funciones **puras** exportadas y testeadas sin DOM.
- Todo respeta `prefers-reduced-motion`: sin auto-avance y `scrollTo` con `behavior: "auto"`.
- La lista de **Favoritos** (`src/app/(store)/favoritos/*`) NO usa `ProductCard` — queda fuera, no se toca.
- La tira de miniaturas del detalle y su `onSelectVariant` NO cambian.
- Cap de imágenes por tarjeta: **5**. Se excluyen las `vendida`. Orden: `is_primary` primero, luego `sort_order`.
- Commits atómicos en español. Trabajo en el worktree `.worktrees/rediseno-backend`, rama `rediseno-backend`.
- No se agregan dependencias npm.

---

## File Structure

- **Create** `src/lib/store/ordenar-imagenes-tarjeta.ts` — helper puro `ordenarImagenesTarjeta`. (Task 1)
- **Create** `src/lib/store/__tests__/ordenar-imagenes-tarjeta.test.ts`. (Task 1)
- **Create** `src/lib/store/use-carrusel-tactil.ts` — `siguienteIndice`, `indiceDesdeScroll` (puras) + `useCarruselTactil` (hook). (Task 2)
- **Create** `src/lib/store/__tests__/use-carrusel-tactil.test.ts`. (Task 2)
- **Create** `src/components/store/tarjeta-galeria.tsx` — mini galería de la tarjeta. (Task 3)
- **Create** `src/components/store/__tests__/tarjeta-galeria.test.tsx`. (Task 3)
- **Modify** `src/components/store/product-card.tsx` — `ProductCardData.imageUrls`, usa `TarjetaGaleria`. (Task 4)
- **Modify** `src/lib/store/fetch-catalog.ts` — trae todas las imágenes. (Task 4)
- **Modify** `src/app/(store)/page.tsx` — ídem (destacados). (Task 4)
- **Modify** `src/app/(store)/producto/[slug]/page.tsx` — ídem (relacionados). (Task 4)
- **Create** `src/components/store/__tests__/product-card.test.tsx`. (Task 4)
- **Create** `src/components/store/lightbox-imagenes.tsx` — overlay a pantalla completa. (Task 5)
- **Create** `src/components/store/__tests__/lightbox-imagenes.test.tsx`. (Task 5)
- **Modify** `src/app/(store)/producto/[slug]/product-gallery.tsx` — abre el lightbox al tocar la imagen grande. (Task 6)
- **Modify** `src/app/(store)/producto/[slug]/__tests__/…` o nuevo test para `ProductGallery`. (Task 6)

---

## Task 1: Helper `ordenarImagenesTarjeta`

**Files:**
- Create: `src/lib/store/ordenar-imagenes-tarjeta.ts`
- Test: `src/lib/store/__tests__/ordenar-imagenes-tarjeta.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `export type ImagenTarjeta = { url: string; sortOrder: number; isPrimary: boolean; vendida: boolean }` y `export function ordenarImagenesTarjeta(imagenes: ImagenTarjeta[]): string[]`. Task 4 lo importa en los 3 builders.

- [ ] **Step 1: Escribir el test que falla**

`src/lib/store/__tests__/ordenar-imagenes-tarjeta.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ordenarImagenesTarjeta,
  type ImagenTarjeta,
} from "../ordenar-imagenes-tarjeta";

const img = (over: Partial<ImagenTarjeta>): ImagenTarjeta => ({
  url: "u",
  sortOrder: 0,
  isPrimary: false,
  vendida: false,
  ...over,
});

describe("ordenarImagenesTarjeta", () => {
  it("pone la primaria primero aunque tenga sort_order mayor", () => {
    const r = ordenarImagenesTarjeta([
      img({ url: "a", sortOrder: 0 }),
      img({ url: "prim", sortOrder: 9, isPrimary: true }),
      img({ url: "b", sortOrder: 1 }),
    ]);
    expect(r).toEqual(["prim", "a", "b"]);
  });

  it("ordena las no primarias por sort_order", () => {
    const r = ordenarImagenesTarjeta([
      img({ url: "c", sortOrder: 3 }),
      img({ url: "a", sortOrder: 1 }),
      img({ url: "b", sortOrder: 2 }),
    ]);
    expect(r).toEqual(["a", "b", "c"]);
  });

  it("excluye las fotos vendidas", () => {
    const r = ordenarImagenesTarjeta([
      img({ url: "viva", sortOrder: 0 }),
      img({ url: "vendida", sortOrder: 1, vendida: true }),
    ]);
    expect(r).toEqual(["viva"]);
  });

  it("recorta a 5 imagenes", () => {
    const r = ordenarImagenesTarjeta(
      Array.from({ length: 8 }, (_, i) => img({ url: `u${i}`, sortOrder: i })),
    );
    expect(r).toHaveLength(5);
    expect(r).toEqual(["u0", "u1", "u2", "u3", "u4"]);
  });

  it("lista vacia -> []", () => {
    expect(ordenarImagenesTarjeta([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run src/lib/store/__tests__/ordenar-imagenes-tarjeta.test.ts`
Expected: FAIL — `Failed to resolve import "../ordenar-imagenes-tarjeta"`.

- [ ] **Step 3: Implementación**

`src/lib/store/ordenar-imagenes-tarjeta.ts`:

```ts
export type ImagenTarjeta = {
  url: string;
  sortOrder: number;
  isPrimary: boolean;
  vendida: boolean;
};

const MAX_IMAGENES_TARJETA = 5;

/**
 * Ordena las fotos de un producto para la mini galeria de la tarjeta del
 * catalogo: la primaria primero, luego por sort_order, sin las unidades
 * ya vendidas, y como maximo 5 (para no cargar 20 estampados por tarjeta).
 */
export function ordenarImagenesTarjeta(imagenes: ImagenTarjeta[]): string[] {
  return imagenes
    .filter((img) => !img.vendida)
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    })
    .slice(0, MAX_IMAGENES_TARJETA)
    .map((img) => img.url);
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run src/lib/store/__tests__/ordenar-imagenes-tarjeta.test.ts`
Expected: PASS (5).

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/ordenar-imagenes-tarjeta.ts src/lib/store/__tests__/ordenar-imagenes-tarjeta.test.ts
git commit -m "feat: helper ordenarImagenesTarjeta (primaria primero, sin vendidas, max 5)"
```

---

## Task 2: `useCarruselTactil` (hook + puras)

**Files:**
- Create: `src/lib/store/use-carrusel-tactil.ts`
- Test: `src/lib/store/__tests__/use-carrusel-tactil.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  ```ts
  export function siguienteIndice(actual: number, total: number): number;
  export function indiceDesdeScroll(scrollLeft: number, anchoSlide: number, total: number): number;
  export function useCarruselTactil(opciones: {
    total: number;
    autoAvanceMs?: number;
    desfaseInicialMs?: number;
  }): {
    ref: React.RefObject<HTMLDivElement | null>;
    indice: number;
    irA: (i: number, opciones?: { suave?: boolean }) => void;
  };
  ```
  Tasks 3 y 5 usan `useCarruselTactil`; Task 5 usa `irA(i, { suave: false })` para el arranque.

- [ ] **Step 1: Escribir los tests que fallan**

`src/lib/store/__tests__/use-carrusel-tactil.test.ts`:

> **Nota de setup (importante):** los efectos del hook leen `ref.current`,
> que React solo adjunta ANTES de correr los efectos cuando el ref está en
> un elemento renderizado. Por eso el test NO usa `renderHook` + asignación
> manual del ref (eso deja `ref.current` en `null` cuando corre el efecto
> de auto-avance). En su lugar renderiza un componente-arnés que monta
> `<div ref={api.ref}>` de verdad y expone la API por callback.

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, act } from "@testing-library/react";
import {
  siguienteIndice,
  indiceDesdeScroll,
  useCarruselTactil,
} from "../use-carrusel-tactil";

type Api = ReturnType<typeof useCarruselTactil>;

function Arnes({
  opts,
  apiRef,
}: {
  opts: Parameters<typeof useCarruselTactil>[0];
  apiRef: { current: Api | null };
}) {
  const api = useCarruselTactil(opts);
  apiRef.current = api;
  return <div ref={api.ref} data-testid="track" style={{ width: 100 }} />;
}

describe("siguienteIndice", () => {
  it("cicla al llegar al final", () => {
    expect(siguienteIndice(0, 3)).toBe(1);
    expect(siguienteIndice(2, 3)).toBe(0);
  });
  it("con total <= 1 siempre 0", () => {
    expect(siguienteIndice(0, 1)).toBe(0);
    expect(siguienteIndice(0, 0)).toBe(0);
  });
});

describe("indiceDesdeScroll", () => {
  it("redondea a la diapositiva mas cercana", () => {
    expect(indiceDesdeScroll(0, 100, 4)).toBe(0);
    expect(indiceDesdeScroll(140, 100, 4)).toBe(1);
    expect(indiceDesdeScroll(160, 100, 4)).toBe(2);
  });
  it("recorta al rango valido", () => {
    expect(indiceDesdeScroll(9999, 100, 3)).toBe(2);
    expect(indiceDesdeScroll(-50, 100, 3)).toBe(0);
  });
  it("con anchoSlide <= 0 devuelve 0", () => {
    expect(indiceDesdeScroll(300, 0, 3)).toBe(0);
  });
});

describe("useCarruselTactil", () => {
  let ioCallback: ((entries: { isIntersecting: boolean }[]) => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    ioCallback = null;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
          ioCallback = cb;
        }
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    // jsdom no implementa scrollTo en elementos
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      value: 100,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function montar(opts: Parameters<typeof useCarruselTactil>[0]) {
    const apiRef: { current: Api | null } = { current: null };
    const r = render(<Arnes opts={opts} apiRef={apiRef} />);
    return { ...r, apiRef };
  }

  it("irA(i) actualiza el indice y llama scrollTo con el offset del slide", () => {
    const { apiRef } = montar({ total: 4 });
    act(() => apiRef.current!.irA(2));
    expect(apiRef.current!.indice).toBe(2);
    expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ left: 200 }),
    );
  });

  it("auto-avanza cuando esta en viewport y la pestana visible", () => {
    const { apiRef } = montar({ total: 3, autoAvanceMs: 3000 });
    act(() => ioCallback?.([{ isIntersecting: true }]));
    act(() => vi.advanceTimersByTime(3000));
    expect(apiRef.current!.indice).toBe(1);
    act(() => vi.advanceTimersByTime(3000));
    expect(apiRef.current!.indice).toBe(2);
  });

  it("NO auto-avanza si el carrusel esta fuera del viewport", () => {
    const { apiRef } = montar({ total: 3, autoAvanceMs: 3000 });
    act(() => ioCallback?.([{ isIntersecting: false }]));
    act(() => vi.advanceTimersByTime(9000));
    expect(apiRef.current!.indice).toBe(0);
  });

  it("NO auto-avanza con prefers-reduced-motion", () => {
    vi.mocked(matchMedia).mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    const { apiRef } = montar({ total: 3, autoAvanceMs: 3000 });
    act(() => ioCallback?.([{ isIntersecting: true }]));
    act(() => vi.advanceTimersByTime(9000));
    expect(apiRef.current!.indice).toBe(0);
  });

  it("limpia el intervalo al desmontar (no sigue avanzando)", () => {
    const { apiRef, unmount } = montar({ total: 3, autoAvanceMs: 3000 });
    act(() => ioCallback?.([{ isIntersecting: true }]));
    act(() => vi.advanceTimersByTime(3000)); // primer avance ok
    expect(apiRef.current!.indice).toBe(1);
    unmount();
    const antes = apiRef.current!.indice;
    act(() => vi.advanceTimersByTime(9000));
    expect(apiRef.current!.indice).toBe(antes);
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run src/lib/store/__tests__/use-carrusel-tactil.test.ts`
Expected: FAIL — módulo no resuelto.

- [ ] **Step 3: Implementación**

`src/lib/store/use-carrusel-tactil.ts`:

```ts
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

  const indiceRef = useRef(0);
  indiceRef.current = indice;
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
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run src/lib/store/__tests__/use-carrusel-tactil.test.ts`
Expected: PASS (todos). Si algún test del hook falla por el timing de `act`/fake-timers, ajustar el test (envolver los avances de tiempo en `act`) sin cambiar la implementación salvo que el fallo revele un bug real.

- [ ] **Step 5: Lint + typecheck**

Run: `npx eslint src/lib/store/use-carrusel-tactil.ts src/lib/store/__tests__/use-carrusel-tactil.test.ts`
Run: `npx tsc --noEmit 2>&1 | grep -E "use-carrusel-tactil" || echo "sin errores"`

- [ ] **Step 6: Commit**

```bash
git add src/lib/store/use-carrusel-tactil.ts src/lib/store/__tests__/use-carrusel-tactil.test.ts
git commit -m "feat: hook useCarruselTactil (scroll-snap + indice + auto-avance gateado)"
```

---

## Task 3: `TarjetaGaleria`

**Files:**
- Create: `src/components/store/tarjeta-galeria.tsx`
- Test: `src/components/store/__tests__/tarjeta-galeria.test.tsx`

**Interfaces:**
- Consumes: `useCarruselTactil` (Task 2).
- Produces: `export function TarjetaGaleria({ images, alt }: { images: string[]; alt: string })`. Task 4 la usa en `product-card.tsx`.

- [ ] **Step 1: Escribir los tests que fallan**

`src/components/store/__tests__/tarjeta-galeria.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TarjetaGaleria } from "../tarjeta-galeria";

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    value: 100,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("TarjetaGaleria", () => {
  it("sin imagenes muestra el placeholder", () => {
    render(<TarjetaGaleria images={[]} alt="Pijama" />);
    expect(screen.getByText("Sin imagen")).toBeInTheDocument();
  });

  it("con una sola imagen no muestra dots", () => {
    render(<TarjetaGaleria images={["u1"]} alt="Pijama" />);
    expect(screen.queryByRole("button", { name: /ver imagen/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("con varias imagenes muestra un slide y un dot por imagen", () => {
    render(<TarjetaGaleria images={["u1", "u2", "u3"]} alt="Pijama" />);
    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /ver imagen/i })).toHaveLength(3);
  });

  it("clic en un dot desplaza a ese indice y no propaga el clic (no navega)", () => {
    const onClickPadre = vi.fn();
    render(
      <a href="/x" onClick={onClickPadre}>
        <TarjetaGaleria images={["u1", "u2", "u3"]} alt="Pijama" />
      </a>,
    );
    const dot3 = screen.getAllByRole("button", { name: /ver imagen/i })[2];
    fireEvent.click(dot3);
    // el track hizo scrollTo al offset del 3er slide (2 * clientWidth = 200)
    expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ left: 200 }),
    );
    expect(onClickPadre).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run src/components/store/__tests__/tarjeta-galeria.test.tsx`
Expected: FAIL — módulo no resuelto.

- [ ] **Step 3: Implementación**

`src/components/store/tarjeta-galeria.tsx`:

```tsx
"use client";

import { useRef } from "react";
import Image from "next/image";
import { useCarruselTactil } from "@/lib/store/use-carrusel-tactil";

export function TarjetaGaleria({ images, alt }: { images: string[]; alt: string }) {
  // Desfase de arranque estable por tarjeta: evita que toda la grilla
  // avance al mismo tiempo.
  const desfase = useRef(Math.floor(Math.random() * 1500));
  const { ref, indice, irA } = useCarruselTactil({
    total: images.length,
    autoAvanceMs: images.length > 1 ? 3000 : undefined,
    desfaseInicialMs: desfase.current,
  });

  if (images.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-brand-ciruela/50">
        Sin imagen
      </div>
    );
  }

  if (images.length === 1) {
    return <Image src={images[0]} alt={alt} fill className="object-contain" />;
  }

  return (
    <div className="absolute inset-0">
      <div
        ref={ref}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((url, i) => (
          <div key={url + i} className="relative h-full w-full shrink-0 snap-start">
            <Image src={url} alt={alt} fill className="object-contain" />
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
        {images.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Ver imagen ${i + 1}`}
            aria-current={i === indice}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              irA(i);
            }}
            className={`pointer-events-auto h-1.5 w-1.5 rounded-full transition ${
              i === indice ? "bg-brand-crema" : "bg-brand-crema/50"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run src/components/store/__tests__/tarjeta-galeria.test.tsx`
Expected: PASS (4).

- [ ] **Step 5: Lint + typecheck**

Run: `npx eslint src/components/store/tarjeta-galeria.tsx src/components/store/__tests__/tarjeta-galeria.test.tsx`
Run: `npx tsc --noEmit 2>&1 | grep -E "tarjeta-galeria" || echo "sin errores"`

- [ ] **Step 6: Commit**

```bash
git add src/components/store/tarjeta-galeria.tsx src/components/store/__tests__/tarjeta-galeria.test.tsx
git commit -m "feat: TarjetaGaleria — mini galeria de la tarjeta con dots y auto-avance"
```

---

## Task 4: `ProductCardData.imageUrls` + 3 builders + `ProductCard`

**Files:**
- Modify: `src/components/store/product-card.tsx`
- Modify: `src/lib/store/fetch-catalog.ts`
- Modify: `src/app/(store)/page.tsx`
- Modify: `src/app/(store)/producto/[slug]/page.tsx`
- Create: `src/components/store/__tests__/product-card.test.tsx`

**Interfaces:**
- Consumes: `ordenarImagenesTarjeta` (Task 1), `TarjetaGaleria` (Task 3).
- Produces: `ProductCardData` con `imageUrls: string[]` en vez de `imageUrl: string | null`.

- [ ] **Step 1: Escribir el test que falla**

`src/components/store/__tests__/product-card.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProductCard, type ProductCardData } from "../product-card";

vi.mock("@/components/store/favorite-button", () => ({
  FavoriteButton: (props: { product: { imageUrl: string | null } }) => (
    <div data-testid="fav" data-image={props.product.imageUrl ?? ""} />
  ),
}));

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} unobserve() {} });
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 100 });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const base: ProductCardData = {
  id: "p1",
  slug: "pijama",
  name: "Pijama rosa",
  price: 50000,
  promoPrice: null,
  imageUrls: [],
  tallas: [],
};

describe("ProductCard", () => {
  it("con varias imagenes renderiza la mini galeria (varias <img>)", () => {
    render(
      <ProductCard
        product={{ ...base, imageUrls: ["u1", "u2"] }}
        currentUserId={null}
        initialFavorite={false}
      />,
    );
    expect(screen.getAllByRole("img").length).toBeGreaterThanOrEqual(2);
  });

  it("pasa la primera imagen al boton de favorito", () => {
    render(
      <ProductCard
        product={{ ...base, imageUrls: ["primera", "segunda"] }}
        currentUserId={null}
        initialFavorite={false}
      />,
    );
    expect(screen.getByTestId("fav").getAttribute("data-image")).toBe("primera");
  });

  it("sin imagenes muestra 'Sin imagen'", () => {
    render(<ProductCard product={base} currentUserId={null} initialFavorite={false} />);
    expect(screen.getByText("Sin imagen")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run src/components/store/__tests__/product-card.test.tsx`
Expected: FAIL — `imageUrls` no existe en `ProductCardData` / `ProductCard` sigue usando `imageUrl`.

- [ ] **Step 3: `product-card.tsx`**

- En `ProductCardData`: cambiar `imageUrl: string | null;` por `imageUrls: string[];`.
- Import nuevo: `import { TarjetaGaleria } from "@/components/store/tarjeta-galeria";`.
- Reemplazar el bloque de imagen dentro del `<div className="relative aspect-square …">`:

  ```tsx
  {/* antes: {product.imageUrl ? <Image .../> : <div>Sin imagen</div>} */}
  <TarjetaGaleria images={product.imageUrls} alt={product.name} />
  ```

  (El badge de descuento y el `FavoriteButton` `absolute` se quedan como
  hermanos DESPUÉS de `<TarjetaGaleria>`, dentro del mismo contenedor
  `relative aspect-square`.)
- `FavoriteButton`: `imageUrl: product.imageUrls[0] ?? null` (antes `product.imageUrl`).
- `precioMostrado` sigue igual; el `<Link>` sigue igual.

- [ ] **Step 4: `fetch-catalog.ts`**

En el `Promise.all` de imágenes/favoritos (~línea 126): cambiar el select de imágenes:

```ts
    idsFiltrados.length > 0
      ? supabase
          .from("product_images")
          .select("product_id, url, sort_order, is_primary, vendida")
          .in("product_id", idsFiltrados)
      : Promise.resolve({
          data: [] as {
            product_id: string;
            url: string;
            sort_order: number;
            is_primary: boolean;
            vendida: boolean;
          }[],
        }),
```

Reemplazar `const imagenPorProducto = new Map(...)` por:

```ts
  const imagenesPorProducto = new Map<string, {
    url: string;
    sortOrder: number;
    isPrimary: boolean;
    vendida: boolean;
  }[]>();
  for (const img of imagenes ?? []) {
    const lista = imagenesPorProducto.get(img.product_id) ?? [];
    lista.push({
      url: img.url,
      sortOrder: img.sort_order,
      isPrimary: img.is_primary,
      vendida: img.vendida,
    });
    imagenesPorProducto.set(img.product_id, lista);
  }
```

En el `.map` a `ProductCardData` (~línea 157): `imageUrl: imagenPorProducto.get(p.id) ?? null` → `imageUrls: ordenarImagenesTarjeta(imagenesPorProducto.get(p.id) ?? [])`.

Import: `import { ordenarImagenesTarjeta } from "@/lib/store/ordenar-imagenes-tarjeta";`.

- [ ] **Step 5: `src/app/(store)/page.tsx` (destacados)**

Mismo patrón: el select de imágenes (~línea 80) pasa a
`.select("product_id, url, sort_order, is_primary, vendida")` sin `.eq("is_primary", true)`; construir `imagenesPorProducto` agrupado como en el Step 4; en el `.map` a `ProductCardData` (~línea 110) `imageUrl: …` → `imageUrls: ordenarImagenesTarjeta(imagenesPorProducto.get(p.id) ?? [])`. Import del helper.

- [ ] **Step 6: `src/app/(store)/producto/[slug]/page.tsx` (relacionados)**

Mismo patrón para `imagenesRelacionados` (~línea 124): quitar `.eq("is_primary", true)`, ampliar el select, agrupar en `imagenesPorRelacionado`, y en el `.map` a `relacionados: ProductCardData[]` (~línea 162) `imageUrl: imagenPorRelacionado.get(p.id) ?? null` → `imageUrls: ordenarImagenesTarjeta(imagenesPorRelacionado.get(p.id) ?? [])`. Import del helper. (Este archivo ya importa cosas de `@/lib/store/…`.)

- [ ] **Step 7: Correr tests + suite + build**

Run: `npx vitest run src/components/store/__tests__/product-card.test.tsx` → PASS (3).
Run: `npx vitest run` → todo verde (arreglar cualquier test viejo que construyera `ProductCardData` con `imageUrl`).
Run: `npx tsc --noEmit 2>&1 | grep -E "product-card|fetch-catalog|\(store\)/page|producto/\[slug\]/page" || echo "sin errores en archivos tocados"`
Run: `npx eslint src/components/store/product-card.tsx src/lib/store/fetch-catalog.ts "src/app/(store)/page.tsx" "src/app/(store)/producto/[slug]/page.tsx" src/components/store/__tests__/product-card.test.tsx`
Run: `npx next build` → OK.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: la tarjeta de producto usa varias imagenes (imageUrls) con mini galeria

ProductCardData.imageUrl -> imageUrls: string[]. Los 3 builders
(fetch-catalog, home, relacionados) traen todas las fotos del producto y
ordenarImagenesTarjeta las filtra/ordena/recorta. ProductCard renderiza
TarjetaGaleria; el favorito recibe imageUrls[0]."
```

---

## Task 5: `LightboxImagenes`

**Files:**
- Create: `src/components/store/lightbox-imagenes.tsx`
- Test: `src/components/store/__tests__/lightbox-imagenes.test.tsx`

**Interfaces:**
- Consumes: `useCarruselTactil` (Task 2).
- Produces:
  ```ts
  export function LightboxImagenes({
    images,          // { url: string; alt: string | null }[]
    indiceInicial,
    productName,
    onClose,
  }: {
    images: { url: string; alt: string | null }[];
    indiceInicial: number;
    productName: string;
    onClose: () => void;
  }): React.ReactPortal | null;
  ```
  Task 6 lo monta desde `ProductGallery`.

- [ ] **Step 1: Escribir los tests que fallan**

`src/components/store/__tests__/lightbox-imagenes.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LightboxImagenes } from "../lightbox-imagenes";

const imgs = [
  { url: "u1", alt: "a1" },
  { url: "u2", alt: null },
  { url: "u3", alt: "a3" },
];

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} unobserve() {} });
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 100 });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("LightboxImagenes", () => {
  it("arranca posicionado en la imagen inicial (scrollTo sin animacion)", () => {
    render(<LightboxImagenes images={imgs} indiceInicial={2} productName="Pijama" onClose={vi.fn()} />);
    expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ left: 200, behavior: "auto" }),
    );
  });

  it("muestra el contador n / N", () => {
    render(<LightboxImagenes images={imgs} indiceInicial={0} productName="Pijama" onClose={vi.fn()} />);
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("la tecla Escape cierra", () => {
    const onClose = vi.fn();
    render(<LightboxImagenes images={imgs} indiceInicial={0} productName="Pijama" onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("el boton Cerrar cierra", () => {
    const onClose = vi.fn();
    render(<LightboxImagenes images={imgs} indiceInicial={0} productName="Pijama" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /cerrar/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("clic en el fondo cierra, pero clic en la imagen NO", () => {
    const onClose = vi.fn();
    render(<LightboxImagenes images={imgs} indiceInicial={0} productName="Pijama" onClose={onClose} />);
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole("img")[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("el boton siguiente avanza el contador", () => {
    render(<LightboxImagenes images={imgs} indiceInicial={0} productName="Pijama" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("bloquea el scroll del body mientras esta montado y lo restaura al desmontar", () => {
    const { unmount } = render(
      <LightboxImagenes images={imgs} indiceInicial={0} productName="Pijama" onClose={vi.fn()} />,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
```

- [ ] **Step 2: Correr y ver fallar** — módulo no resuelto.

- [ ] **Step 3: Implementación**

`src/components/store/lightbox-imagenes.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { useCarruselTactil } from "@/lib/store/use-carrusel-tactil";

export function LightboxImagenes({
  images,
  indiceInicial,
  productName,
  onClose,
}: {
  images: { url: string; alt: string | null }[];
  indiceInicial: number;
  productName: string;
  onClose: () => void;
}) {
  const { ref, indice, irA } = useCarruselTactil({ total: images.length });
  const cerrarRef = useRef<HTMLButtonElement | null>(null);
  const montado = useRef(false);

  // Posiciona en la imagen inicial una sola vez, sin animacion.
  useEffect(() => {
    if (montado.current) return;
    montado.current = true;
    irA(indiceInicial, { suave: false });
    cerrarRef.current?.focus();
  }, [indiceInicial, irA]);

  // Esc para cerrar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Bloquea el scroll del body mientras el lightbox esta abierto.
  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Imágenes de ${productName}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
    >
      <button
        ref={cerrarRef}
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute right-3 top-3 z-10 rounded-full bg-black/40 p-2 text-brand-crema"
      >
        <X className="h-5 w-5" />
      </button>

      {images.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Anterior"
            onClick={() => irA(indice - 1)}
            className="absolute left-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-black/40 p-2 text-brand-crema sm:flex"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            aria-label="Siguiente"
            onClick={() => irA(indice + 1)}
            className="absolute right-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-black/40 p-2 text-brand-crema sm:flex"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      <div
        ref={ref}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((img, i) => (
          <div
            key={img.url + i}
            className="relative flex h-full w-full shrink-0 snap-start items-center justify-center"
          >
            <Image
              src={img.url}
              alt={img.alt ?? productName}
              fill
              className="object-contain"
              sizes="100vw"
            />
          </div>
        ))}
      </div>

      <p className="absolute inset-x-0 bottom-3 text-center text-sm text-brand-crema">
        {indice + 1} / {images.length}
      </p>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run src/components/store/__tests__/lightbox-imagenes.test.tsx`
Expected: PASS (7). Nota: el test "clic en la imagen NO cierra" depende de que el `<Image>` esté DENTRO de un slide con `pointer-events` normales y el handler de cierre solo dispare con `e.target === e.currentTarget`; si `next/image` en jsdom renderiza algo que burbujea distinto, ajustar el test para hacer clic en el `div` del slide en vez del `img` — sin relajar la condición del componente.

- [ ] **Step 5: Lint + typecheck**

Run: `npx eslint src/components/store/lightbox-imagenes.tsx src/components/store/__tests__/lightbox-imagenes.test.tsx`
Run: `npx tsc --noEmit 2>&1 | grep -E "lightbox-imagenes" || echo "sin errores"`

- [ ] **Step 6: Commit**

```bash
git add src/components/store/lightbox-imagenes.tsx src/components/store/__tests__/lightbox-imagenes.test.tsx
git commit -m "feat: LightboxImagenes — overlay a pantalla completa con navegacion"
```

---

## Task 6: `ProductGallery` abre el lightbox

**Files:**
- Modify: `src/app/(store)/producto/[slug]/product-gallery.tsx`
- Test: `src/app/(store)/producto/[slug]/__tests__/product-gallery.test.tsx` (crear)

**Interfaces:**
- Consumes: `LightboxImagenes` (Task 5).
- Produces: nada nuevo.

- [ ] **Step 1: Escribir el test que falla**

`src/app/(store)/producto/[slug]/__tests__/product-gallery.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProductGallery } from "../product-gallery";

const images = [
  { url: "u1", alt: "a1", variantId: null },
  { url: "u2", alt: "a2", variantId: null },
];

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} unobserve() {} });
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 100 });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ProductGallery — lightbox", () => {
  it("al tocar la imagen grande abre el lightbox (aparece un dialog)", () => {
    render(<ProductGallery images={images} productName="Pijama" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /ver imagen ampliada/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("el lightbox se cierra con Escape", () => {
    render(<ProductGallery images={images} productName="Pijama" />);
    fireEvent.click(screen.getByRole("button", { name: /ver imagen ampliada/i }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr y ver fallar** — hoy la imagen grande es un `<div>`, no un `button` con ese `aria-label`, y no hay `dialog`.

- [ ] **Step 3: Implementación**

En `product-gallery.tsx`:
- Import: `import { useState } from "react";` (ya está) + `import { LightboxImagenes } from "@/components/store/lightbox-imagenes";`.
- Estado nuevo junto a `selected`: `const [lightboxIndice, setLightboxIndice] = useState<number | null>(null);`.
- El contenedor de la imagen grande (`<div className="relative aspect-square w-full overflow-hidden rounded-lg bg-brand-rosa-claro"> <Image .../> </div>`) pasa a:

  ```tsx
  <button
    type="button"
    aria-label="Ver imagen ampliada"
    onClick={() => setLightboxIndice(activeIndex)}
    className="relative aspect-square w-full cursor-zoom-in overflow-hidden rounded-lg bg-brand-rosa-claro"
  >
    <Image
      src={images[activeIndex].url}
      alt={images[activeIndex].alt ?? productName}
      fill
      className="object-contain"
    />
  </button>
  ```

- Al final del `return` (después del bloque de miniaturas, dentro del `<div className="flex flex-col gap-3">` o como hermano), montar el lightbox:

  ```tsx
  {lightboxIndice !== null && (
    <LightboxImagenes
      images={images.map((img) => ({ url: img.url, alt: img.alt }))}
      indiceInicial={lightboxIndice}
      productName={productName}
      onClose={() => setLightboxIndice(null)}
    />
  )}
  ```

- Nada más cambia (miniaturas, `onSelectVariant`, reset de `selected` por variante).

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run "src/app/(store)/producto/[slug]/__tests__/product-gallery.test.tsx"`
Expected: PASS (2).

- [ ] **Step 5: Suite completa + lint + build**

Run: `npx vitest run` → todo verde.
Run: `npx eslint "src/app/(store)/producto/[slug]/product-gallery.tsx" "src/app/(store)/producto/[slug]/__tests__/product-gallery.test.tsx"`
Run: `npx tsc --noEmit 2>&1 | grep -E "product-gallery" || echo "sin errores"`
Run: `npx next build` → OK.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: en el detalle, tocar la imagen grande abre el lightbox"
```

---

## Task 7: Verificación manual en navegador

**Files:** ninguno.

- [ ] **Step 1: Catálogo en PC** (`/productos`): las tarjetas con varias fotos rotan solas cada ~3 s, con desfases distintos; al hacer scroll y sacar una tarjeta del viewport deja de rotar; volver a entrar la reactiva.
- [ ] **Step 2: Catálogo en móvil** (DevTools responsive o teléfono real): se puede deslizar la foto de una tarjeta con el dedo; los dots siguen la foto; tocar la tarjeta (sin deslizar) navega al producto.
- [ ] **Step 3: Home y "También te puede gustar"** — mismas tarjetas, mismo comportamiento.
- [ ] **Step 4: Detalle** (`/producto/<slug>` de un producto con varias fotos): tocar la imagen grande abre el lightbox en esa foto; se navega con ‹ › (PC) y deslizando (móvil); el contador cambia; cerrar con X, Esc y tocando el fondo; al cerrar el foco vuelve a la imagen; el scroll del body estaba bloqueado y se restaura.
- [ ] **Step 5: `prefers-reduced-motion`** (DevTools → Rendering → Emulate CSS prefers-reduced-motion: reduce): las tarjetas NO rotan solas pero sí se pueden deslizar; el lightbox no anima el scroll.
- [ ] **Step 6:** producto con **una sola** foto: la tarjeta no muestra dots; el detalle abre el lightbox con una sola imagen y sin flechas.

---

## Self-Review

**Spec coverage:**
- `imageUrls` + helper de orden/filtro/tope → Tasks 1, 4. ✓
- Hook `useCarruselTactil` (scroll-snap, índice, auto-avance gateado, puras) → Task 2. ✓
- `TarjetaGaleria` (0/1/≥2, dots, auto-avance, desfase, no propaga clic) → Task 3. ✓
- 3 builders traen todas las imágenes → Task 4 Steps 4-6. ✓
- `LightboxImagenes` (portal, scroll-snap, X/Esc/fondo, ‹ ›, contador, bloqueo de body, foco) → Task 5. ✓
- `ProductGallery` abre el lightbox al tocar la imagen grande; miniaturas sin cambios → Task 6. ✓
- Respeto de `prefers-reduced-motion` → Task 2 (impl) + Task 7 Step 5 (verif). ✓
- Favoritos fuera / miniaturas del detalle sin cambios → constraint global, ninguna tarea las toca. ✓
- `pnpm build && lint && test` → Task 4 Step 7 y Task 6 Step 5. ✓

**Placeholder scan:** sin "TBD"/"añadir validación"/etc. Todo el código está escrito literal.

**Type consistency:** `ImagenTarjeta` (Task 1) se reusa igual en Task 4. `useCarruselTactil` firma idéntica en Tasks 2, 3, 5. `irA(i, { suave })` definido en Task 2, usado con `{ suave: false }` en Task 5. `LightboxImagenes` props idénticas en Task 5 (def) y Task 6 (uso). `ProductCardData.imageUrls` (Task 4) — el test de Task 4 y los 3 builders usan el mismo nombre.

**Gap / nota:** los tests del hook y de los componentes dependen de mocks de `IntersectionObserver`, `matchMedia`, `HTMLElement.prototype.scrollTo` y `clientWidth` (jsdom no los tiene). Cada archivo de test los define en su `beforeEach`. Si se repite mucho, un helper `src/test/mock-carrusel.ts` es aceptable, pero NO es obligatorio para el plan.
