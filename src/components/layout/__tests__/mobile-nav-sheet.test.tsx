import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MobileNavSheet } from "../mobile-nav-sheet";

describe("MobileNavSheet", () => {
  it("muestra el disparador y, al abrirlo, los enlaces con sus href", async () => {
    render(
      <MobileNavSheet
        links={[
          { href: "/a", label: "Enlace A" },
          { href: "/b", label: "Enlace B" },
        ]}
        triggerLabel="Menú"
      />,
    );

    const trigger = screen.getByRole("button", { name: "Menú" });
    expect(trigger).toBeInTheDocument();

    fireEvent.click(trigger);

    const enlaceA = await screen.findByRole("link", { name: "Enlace A" });
    const enlaceB = await screen.findByRole("link", { name: "Enlace B" });

    expect(enlaceA).toHaveAttribute("href", "/a");
    expect(enlaceB).toHaveAttribute("href", "/b");
  });
});
