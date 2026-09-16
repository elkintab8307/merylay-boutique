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
  it("sin items no renderiza nada", () => {
    render(<NuevaColeccionOverlay items={[]} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("con items, se muestra siempre (sin importar visitas previas)", () => {
    render(<NuevaColeccionOverlay items={[item({})]} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("se muestra de nuevo en cada montaje aunque ya se haya visto antes", () => {
    const { unmount } = render(<NuevaColeccionOverlay items={[item({})]} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    unmount();

    render(<NuevaColeccionOverlay items={[item({})]} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
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

  it("NO hace auto-avance: el carrusel solo se mueve por gesto tactil o control del usuario", () => {
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
      vi.advanceTimersByTime(10_000);
    });

    expect(scrollToMock).not.toHaveBeenCalled();
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

  it("con un solo item no muestra controles anterior/siguiente", () => {
    render(<NuevaColeccionOverlay items={[item({})]} />);
    expect(screen.queryByRole("button", { name: /anterior/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /siguiente/i })).not.toBeInTheDocument();
  });

  it("con varios items muestra controles anterior/siguiente; anterior empieza deshabilitado", () => {
    render(
      <NuevaColeccionOverlay
        items={[item({ variantId: "v1" }), item({ variantId: "v2" }), item({ variantId: "v3" })]}
      />,
    );
    expect(screen.getByRole("button", { name: /anterior/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /siguiente/i })).toBeEnabled();
  });

  it("el control siguiente desplaza el carrusel y habilita anterior", () => {
    const scrollToMock = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: scrollToMock });

    render(
      <NuevaColeccionOverlay
        items={[item({ variantId: "v1" }), item({ variantId: "v2" }), item({ variantId: "v3" })]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));

    expect(scrollToMock).toHaveBeenCalledWith(
      expect.objectContaining({ left: 100 }),
    );
    expect(screen.getByRole("button", { name: /anterior/i })).toBeEnabled();
  });

  it("el control siguiente se deshabilita en la ultima tarjeta", () => {
    render(
      <NuevaColeccionOverlay items={[item({ variantId: "v1" }), item({ variantId: "v2" })]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));

    expect(screen.getByRole("button", { name: /siguiente/i })).toBeDisabled();
  });
});
