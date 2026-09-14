import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CarruselCategoria } from "../carrusel-categoria";
import type { ProductCardData } from "../product-card";

vi.mock("next/image", () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

vi.mock("@/components/store/favorite-button", () => ({
  FavoriteButton: () => <div data-testid="fav" />,
}));

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} unobserve() {} });
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, "scrollBy", { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 100 });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function producto(id: string): ProductCardData {
  return {
    id,
    slug: `producto-${id}`,
    name: `Producto ${id}`,
    price: 50000,
    promoPrice: null,
    imageUrls: [],
    tallas: [],
  };
}

describe("CarruselCategoria", () => {
  it("renderiza una tarjeta por cada producto", () => {
    render(
      <CarruselCategoria
        titulo="Pijamas"
        verTodosHref="/categoria/pijamas"
        productos={[producto("1"), producto("2"), producto("3")]}
        currentUserId={null}
        favoritosSet={new Set()}
      />,
    );
    expect(screen.getByText("Producto 1")).toBeInTheDocument();
    expect(screen.getByText("Producto 2")).toBeInTheDocument();
    expect(screen.getByText("Producto 3")).toBeInTheDocument();
  });

  it("muestra el titulo y el link Ver todo hacia la categoria", () => {
    render(
      <CarruselCategoria
        titulo="Pijamas"
        verTodosHref="/categoria/pijamas"
        productos={[producto("1")]}
        currentUserId={null}
        favoritosSet={new Set()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Pijamas" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /ver todo/i });
    expect(link.getAttribute("href")).toBe("/categoria/pijamas");
  });

  it("el boton siguiente desplaza la fila hacia la derecha", () => {
    render(
      <CarruselCategoria
        titulo="Pijamas"
        verTodosHref="/categoria/pijamas"
        productos={[producto("1"), producto("2")]}
        currentUserId={null}
        favoritosSet={new Set()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(HTMLElement.prototype.scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({ left: expect.any(Number) }),
    );
    const llamada = vi.mocked(HTMLElement.prototype.scrollBy).mock.calls[0][0] as unknown as { left: number };
    expect(llamada.left).toBeGreaterThan(0);
  });

  it("el boton anterior desplaza la fila hacia la izquierda", () => {
    render(
      <CarruselCategoria
        titulo="Pijamas"
        verTodosHref="/categoria/pijamas"
        productos={[producto("1"), producto("2")]}
        currentUserId={null}
        favoritosSet={new Set()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /anterior/i }));
    const llamada = vi.mocked(HTMLElement.prototype.scrollBy).mock.calls[0][0] as unknown as { left: number };
    expect(llamada.left).toBeLessThan(0);
  });

  it("sin productos no renderiza nada", () => {
    const { container } = render(
      <CarruselCategoria
        titulo="Bolsos dama"
        verTodosHref="/categoria/bolsos-dama"
        productos={[]}
        currentUserId={null}
        favoritosSet={new Set()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
