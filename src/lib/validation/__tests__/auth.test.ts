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
    whatsapp: "3001234567",
    address: "Calle 10 # 20-30",
    email: "maria@example.com",
    password: "secreta1",
    confirmPassword: "secreta1",
  };

  it("acepta datos validos con email", () => {
    expect(registroSchema.safeParse(base).success).toBe(true);
  });

  it("acepta datos validos sin email (email opcional)", () => {
    const { email: _email, ...sinEmail } = base;
    expect(registroSchema.safeParse(sinEmail).success).toBe(true);
  });

  it("acepta email vacio como equivalente a no dar email", () => {
    expect(registroSchema.safeParse({ ...base, email: "" }).success).toBe(true);
  });

  it("rechaza email invalido cuando se proporciona", () => {
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

  it("rechaza whatsapp muy corto", () => {
    expect(registroSchema.safeParse({ ...base, whatsapp: "123" }).success).toBe(
      false,
    );
  });

  it("rechaza whatsapp sin suficientes digitos (solo letras)", () => {
    expect(
      registroSchema.safeParse({ ...base, whatsapp: "abcdefg" }).success,
    ).toBe(false);
  });

  it("rechaza direccion muy corta", () => {
    expect(registroSchema.safeParse({ ...base, address: "Av" }).success).toBe(
      false,
    );
  });
});
