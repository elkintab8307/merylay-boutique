import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProductGallery } from "../product-gallery";

// next/image exige rutas absolutas o con "/" inicial; en el DOM de pruebas
// no hay servidor de imagenes, asi que lo reemplazamos por un <img> plano.
vi.mock("next/image", () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

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

  it("al cerrar el lightbox el foco vuelve a la imagen grande", () => {
    render(<ProductGallery images={images} productName="Pijama" />);
    fireEvent.click(screen.getByRole("button", { name: /ver imagen ampliada/i }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("button", { name: /ver imagen ampliada/i })).toHaveFocus();
  });
});
