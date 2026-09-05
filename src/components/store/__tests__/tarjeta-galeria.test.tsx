import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TarjetaGaleria } from "../tarjeta-galeria";

// next/image exige rutas absolutas o con "/" inicial; en el DOM de pruebas
// no hay servidor de imagenes, asi que lo reemplazamos por un <img> plano.
vi.mock("next/image", () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

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
