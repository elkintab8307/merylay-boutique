import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProductCard, type ProductCardData } from "../product-card";

// next/image exige rutas absolutas o con "/" inicial; en el DOM de pruebas
// no hay servidor de imagenes, asi que lo reemplazamos por un <img> plano.
vi.mock("next/image", () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

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
