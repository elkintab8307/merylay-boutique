import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LightboxImagenes } from "../lightbox-imagenes";

// next/image exige rutas absolutas o con "/" inicial; en el DOM de pruebas
// no hay servidor de imagenes, asi que lo reemplazamos por un <img> plano.
vi.mock("next/image", () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

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

  it("tocar una diapositiva cierra el lightbox", () => {
    const onClose = vi.fn();
    render(
      <LightboxImagenes images={imgs} indiceInicial={0} productName="Pijama" onClose={onClose} />,
    );
    const slide = document.body.querySelectorAll("[data-slide]")[0];
    fireEvent.click(slide);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("el boton Cerrar no dispara un cierre doble", () => {
    const onClose = vi.fn();
    render(<LightboxImagenes images={imgs} indiceInicial={0} productName="Pijama" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /cerrar/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("el boton Siguiente no cierra", () => {
    const onClose = vi.fn();
    render(<LightboxImagenes images={imgs} indiceInicial={0} productName="Pijama" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("el boton siguiente avanza el contador", () => {
    render(<LightboxImagenes images={imgs} indiceInicial={0} productName="Pijama" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("ArrowRight avanza el contador", () => {
    render(<LightboxImagenes images={imgs} indiceInicial={0} productName="Pijama" onClose={vi.fn()} />);
    fireEvent.keyDown(document, { key: "ArrowRight" });
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
