import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "../badge";

describe("Badge", () => {
  it("renderiza el texto y aplica la clase del variant", () => {
    render(<Badge variant="success">Activo</Badge>);
    const badge = screen.getByText("Activo");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("emerald");
  });

  it("aplica clases distintas para cada variant", () => {
    const { rerender } = render(<Badge variant="danger">Agotado</Badge>);
    expect(screen.getByText("Agotado").className).toContain("red");
    rerender(<Badge variant="warning">Stock bajo</Badge>);
    expect(screen.getByText("Stock bajo").className).toContain("amber");
    rerender(<Badge variant="neutral">Inactivo</Badge>);
    expect(screen.getByText("Inactivo").className).toContain("brand-rosa-claro");
  });
});
