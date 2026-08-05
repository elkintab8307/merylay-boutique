import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "../page";

describe("HomePage", () => {
  it("muestra el nombre de la marca", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { name: "MeryLay Boutique" }),
    ).toBeInTheDocument();
  });
});
