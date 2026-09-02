import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ImageUploadButton } from "../image-upload-button";

function foto(nombre: string) {
  return new File(["bytes"], nombre, { type: "image/jpeg" });
}

describe("ImageUploadButton — estados por imagen", () => {
  it("no muestra ningun indicador de estado cuando no se pasan estados", () => {
    render(<ImageUploadButton id="x" files={[foto("a.jpg")]} onChange={vi.fn()} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("muestra un indicador de carga mientras la imagen se esta subiendo", () => {
    const a = foto("a.jpg");
    render(
      <ImageUploadButton
        id="x"
        files={[a]}
        onChange={vi.fn()}
        estados={new Map([[a, "subiendo"]])}
      />,
    );
    expect(screen.getByRole("status", { name: /subiendo/i })).toBeInTheDocument();
  });

  it("muestra un chulo verde cuando la imagen se subio correctamente", () => {
    const a = foto("a.jpg");
    render(
      <ImageUploadButton
        id="x"
        files={[a]}
        onChange={vi.fn()}
        estados={new Map([[a, "ok"]])}
      />,
    );
    expect(screen.getByRole("status", { name: /subida correcta/i })).toBeInTheDocument();
  });

  it("muestra una X roja cuando la imagen no se pudo subir", () => {
    const a = foto("a.jpg");
    render(
      <ImageUploadButton
        id="x"
        files={[a]}
        onChange={vi.fn()}
        estados={new Map([[a, "error"]])}
      />,
    );
    expect(
      screen.getByRole("status", { name: /no se pudo subir/i }),
    ).toBeInTheDocument();
  });
});
