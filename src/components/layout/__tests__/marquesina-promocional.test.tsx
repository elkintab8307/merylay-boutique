import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  MarquesinaPromocional,
  FRASES_PROMOCIONALES_DEFECTO,
} from "../marquesina-promocional";

describe("MarquesinaPromocional", () => {
  it("muestra cada frase con texto y las separa con el simbolo de picas", () => {
    render(
      <MarquesinaPromocional
        frases={["Domicilios Gratis en Armenia", "Alta Calidad en Cada Prenda"]}
      />,
    );
    // Una pista visible + una copia aria-hidden para el bucle: cada frase aparece 2 veces.
    expect(screen.getAllByText("Domicilios Gratis en Armenia")).toHaveLength(2);
    expect(screen.getAllByText("Alta Calidad en Cada Prenda")).toHaveLength(2);
    expect(screen.getAllByText("♠").length).toBeGreaterThan(0);
  });

  it("duplica la pista para que el desplazamiento sea continuo", () => {
    const { container } = render(
      <MarquesinaPromocional frases={["Frase única"]} />,
    );
    const pistas = container.querySelectorAll("[data-pista]");
    expect(pistas).toHaveLength(2);
    // La segunda pista es decorativa para lectores de pantalla.
    expect(pistas[1].getAttribute("aria-hidden")).toBe("true");
  });

  it("omite las frases vacias o solo con espacios", () => {
    render(
      <MarquesinaPromocional
        frases={["Domicilios Gratis en Armenia", "   ", "", "Otra frase"]}
      />,
    );
    const [pista] = document.querySelectorAll("[data-pista]");
    const visibles = within(pista as HTMLElement).getAllByTestId("frase");
    expect(visibles.map((n) => n.textContent)).toEqual([
      "Domicilios Gratis en Armenia",
      "Otra frase",
    ]);
  });

  it("usa las frases por defecto cuando todas vienen vacias", () => {
    render(<MarquesinaPromocional frases={["", "", "", ""]} />);
    expect(
      screen.getAllByText("Domicilios Gratis en Armenia").length,
    ).toBeGreaterThan(0);
    expect(FRASES_PROMOCIONALES_DEFECTO[0]).toBe("Domicilios Gratis en Armenia");
    expect(FRASES_PROMOCIONALES_DEFECTO).toHaveLength(4);
  });

  it("tambien usa las frases por defecto cuando no se pasa ninguna", () => {
    render(<MarquesinaPromocional frases={[]} />);
    expect(
      screen.getAllByText("Nuevas Colecciones Cada Semana").length,
    ).toBeGreaterThan(0);
  });
});
