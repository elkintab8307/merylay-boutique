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
  // Arnes de test: expone la API del hook al test. No es un ref de React.
  // eslint-disable-next-line react-hooks/refs
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
