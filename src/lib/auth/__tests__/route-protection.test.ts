import { describe, expect, it } from "vitest";
import { getRequiredRoles, isRoleAllowed } from "../route-protection";

describe("getRequiredRoles", () => {
  it("exige admin o superadmin para /admin", () => {
    expect(getRequiredRoles("/admin/productos")).toEqual([
      "admin",
      "superadmin",
    ]);
  });

  it("exige staff, admin o superadmin para /pos", () => {
    expect(getRequiredRoles("/pos")).toEqual(["staff", "admin", "superadmin"]);
  });

  it("exige solo superadmin para /superadmin", () => {
    expect(getRequiredRoles("/superadmin/usuarios")).toEqual(["superadmin"]);
  });

  it("no exige rol para rutas publicas", () => {
    expect(getRequiredRoles("/producto/pijama-rosa")).toBeNull();
  });
});

describe("isRoleAllowed", () => {
  it("permite cuando no hay rol requerido", () => {
    expect(isRoleAllowed(null, null)).toBe(true);
  });

  it("rechaza sin sesion cuando se requiere rol", () => {
    expect(isRoleAllowed(null, ["admin", "superadmin"])).toBe(false);
  });

  it("permite cuando el rol del usuario esta en los requeridos", () => {
    expect(isRoleAllowed("staff", ["staff", "admin", "superadmin"])).toBe(
      true,
    );
  });

  it("rechaza cuando el rol del usuario no esta en los requeridos", () => {
    expect(isRoleAllowed("customer", ["admin", "superadmin"])).toBe(false);
  });
});
