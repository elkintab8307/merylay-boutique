import { describe, expect, it } from "vitest";
import { isEmail, normalizeUsername } from "../identifier";

describe("isEmail", () => {
  it("reconoce un email valido", () => {
    expect(isEmail("cliente@example.com")).toBe(true);
  });

  it("reconoce un username como no-email", () => {
    expect(isEmail("adminsu")).toBe(false);
  });

  it("ignora espacios alrededor", () => {
    expect(isEmail("  cliente@example.com  ")).toBe(true);
  });

  it("rechaza un email sin dominio", () => {
    expect(isEmail("cliente@")).toBe(false);
  });
});

describe("normalizeUsername", () => {
  it("quita espacios y simbolos, deja solo digitos de un whatsapp", () => {
    expect(normalizeUsername("300 123 4567")).toBe("3001234567");
    expect(normalizeUsername("+57 300 123 4567")).toBe("573001234567");
  });

  it("produce el mismo resultado sin importar el formato de espaciado", () => {
    expect(normalizeUsername("300-123-4567")).toBe(normalizeUsername("3001234567"));
  });

  it("pasa a minusculas", () => {
    expect(normalizeUsername("Usuario123")).toBe("suario123");
  });
});
