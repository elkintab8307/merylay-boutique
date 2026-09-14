import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NuevaColeccionOverlay } from "../nueva-coleccion-overlay";
import type { NuevaColeccionItem } from "@/lib/store/fetch-nueva-coleccion";

vi.mock("next/image", () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} unobserve() {} });
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 100 });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const item = (over: Partial<NuevaColeccionItem>): NuevaColeccionItem => ({
  variantId: "v1",
  productSlug: "pijama-1",
  productName: "Pijama 1",
  price: 50000,
  promoPrice: null,
  imageUrl: "https://cdn.test/v1.jpg",
  ...over,
});

describe("NuevaColeccionOverlay", () => {
  it("sin items no renderiza nada ni toca sessionStorage", () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    render(<NuevaColeccionOverlay items={[]} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it("con items y sesion nueva, se muestra y marca sessionStorage", () => {
    render(<NuevaColeccionOverlay items={[item({})]} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(sessionStorage.getItem("nueva-coleccion-vista")).toBe("1");
  });

  it("si sessionStorage ya tiene la marca, no se muestra", () => {
    sessionStorage.setItem("nueva-coleccion-vista", "1");
    render(<NuevaColeccionOverlay items={[item({})]} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cierra con Escape", () => {
    render(<NuevaColeccionOverlay items={[item({})]} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cierra con el boton Cerrar", () => {
    render(<NuevaColeccionOverlay items={[item({})]} />);
    fireEvent.click(screen.getByRole("button", { name: /cerrar/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cierra al tocar el fondo", () => {
    render(<NuevaColeccionOverlay items={[item({})]} />);
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("hace auto-avance del carrusel cuando hay mas de un item y esta en viewport", () => {
    let ioCallback: (entries: { isIntersecting: boolean }[]) => void = () => {};
    class IntersectionObserverStub {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
        ioCallback = cb;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
    const scrollToMock = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: scrollToMock });

    vi.useFakeTimers();

    render(
      <NuevaColeccionOverlay
        items={[item({ variantId: "v1", productSlug: "pijama-uno" }), item({ variantId: "v2", productSlug: "pijama-dos" })]}
      />,
    );

    act(() => {
      ioCallback([{ isIntersecting: true }]);
    });

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(scrollToMock).toHaveBeenCalled();
  });

  it("cada tarjeta enlaza al producto correcto", () => {
    render(
      <NuevaColeccionOverlay
        items={[item({ variantId: "v1", productSlug: "pijama-uno" }), item({ variantId: "v2", productSlug: "pijama-dos" })]}
      />,
    );
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/producto/pijama-uno",
      "/producto/pijama-dos",
    ]);
  });
});
