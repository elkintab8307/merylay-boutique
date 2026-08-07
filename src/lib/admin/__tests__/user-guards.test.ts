import { describe, expect, it } from "vitest";
import { puedeBloquear, puedeCambiarRol } from "../user-guards";

describe("puedeCambiarRol", () => {
  it("permite cambiar el rol de otro usuario", () => {
    expect(puedeCambiarRol("actor-1", "usuario-2")).toBe(true);
  });

  it("no permite que un usuario se cambie su propio rol", () => {
    expect(puedeCambiarRol("actor-1", "actor-1")).toBe(false);
  });
});

describe("puedeBloquear", () => {
  it("permite bloquear a otro usuario", () => {
    expect(puedeBloquear("actor-1", "usuario-2")).toBe(true);
  });

  it("no permite que un usuario se bloquee a si mismo", () => {
    expect(puedeBloquear("actor-1", "actor-1")).toBe(false);
  });
});
