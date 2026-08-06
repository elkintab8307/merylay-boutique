import { describe, expect, it } from "vitest";
import { categoriaSchema } from "../categoria";

describe("categoriaSchema", () => {
  const base = {
    name: "Pijamas",
    slug: "pijamas",
    description: "",
    parentId: null,
    sortOrder: 0,
    isActive: true,
  };

  it("acepta datos validos", () => {
    expect(categoriaSchema.safeParse(base).success).toBe(true);
  });

  it("rechaza nombre muy corto", () => {
    expect(categoriaSchema.safeParse({ ...base, name: "A" }).success).toBe(false);
  });

  it("rechaza slug muy corto", () => {
    expect(categoriaSchema.safeParse({ ...base, slug: "a" }).success).toBe(false);
  });

  it("rechaza sortOrder negativo", () => {
    expect(categoriaSchema.safeParse({ ...base, sortOrder: -1 }).success).toBe(false);
  });

  it("acepta parentId nulo", () => {
    expect(categoriaSchema.safeParse({ ...base, parentId: null }).success).toBe(true);
  });

  it("rechaza parentId invalido", () => {
    expect(
      categoriaSchema.safeParse({ ...base, parentId: "no-es-uuid" }).success,
    ).toBe(false);
  });
});
