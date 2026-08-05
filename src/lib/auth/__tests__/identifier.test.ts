import { describe, expect, it } from "vitest";
import { isEmail } from "../identifier";

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
