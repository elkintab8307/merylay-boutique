import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Store } from "lucide-react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/pos",
}));

import { BackendSidebar } from "../backend-sidebar";

describe("BackendSidebar", () => {
  it("renderiza un icono cuando el item lo trae", () => {
    render(
      <BackendSidebar
        sections={[
          { label: "POS", items: [{ href: "/pos", label: "Terminal", icon: <Store className="h-4 w-4" /> }] },
        ]}
        homeHref="/pos"
      />,
    );
    const enlaces = screen.getAllByText("Terminal");
    expect(enlaces.length).toBeGreaterThan(0);
    const link = enlaces[0].closest("a");
    expect(link?.querySelector("svg")).toBeInTheDocument();
  });

  it("no rompe cuando el item no trae icono (compatibilidad con admin-nav)", () => {
    render(
      <BackendSidebar
        sections={[{ label: "Panel", items: [{ href: "/admin", label: "Inicio" }] }]}
        homeHref="/admin"
      />,
    );
    expect(screen.getAllByText("Inicio").length).toBeGreaterThan(0);
  });

  it("muestra el trigger movil propio por defecto (ocultarTriggerMovil sin pasar)", () => {
    render(
      <BackendSidebar
        sections={[{ label: "POS", items: [{ href: "/pos", label: "Terminal" }] }]}
        homeHref="/pos"
      />,
    );
    expect(screen.getByLabelText("Menú")).toBeInTheDocument();
  });

  it("oculta el trigger movil propio cuando ocultarTriggerMovil es true", () => {
    render(
      <BackendSidebar
        sections={[{ label: "POS", items: [{ href: "/pos", label: "Terminal" }] }]}
        homeHref="/pos"
        ocultarTriggerMovil
      />,
    );
    expect(screen.queryByLabelText("Menú")).not.toBeInTheDocument();
  });
});
