import { describe, expect, it } from "vitest";
import { loginSchema, registroSchema } from "../auth";

describe("loginSchema", () => {
  it("acepta un identificador y password validos", () => {
    const result = loginSchema.safeParse({
      identifier: "adminsu",
      password: "secreta1",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza identificador vacio", () => {
    const result = loginSchema.safeParse({ identifier: "", password: "secreta1" });
    expect(result.success).toBe(false);
  });

  it("rechaza password corta", () => {
    const result = loginSchema.safeParse({ identifier: "adminsu", password: "123" });
    expect(result.success).toBe(false);
  });
});

describe("registroSchema", () => {
  const base = {
    fullName: "Maria Perez",
    email: "maria@example.com",
    password: "secreta1",
    confirmPassword: "secreta1",
  };

  it("acepta datos validos", () => {
    expect(registroSchema.safeParse(base).success).toBe(true);
  });

  it("rechaza email invalido", () => {
    expect(
      registroSchema.safeParse({ ...base, email: "no-es-email" }).success,
    ).toBe(false);
  });

  it("rechaza si las contrasenas no coinciden", () => {
    expect(
      registroSchema.safeParse({ ...base, confirmPassword: "otra12345" })
        .success,
    ).toBe(false);
  });

  it("rechaza nombre muy corto", () => {
    expect(registroSchema.safeParse({ ...base, fullName: "A" }).success).toBe(
      false,
    );
  });
});
