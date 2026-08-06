import { describe, expect, it } from "vitest";
import { resolveSort } from "../sort";

describe("resolveSort", () => {
  it("resuelve precio-asc", () => {
    expect(resolveSort("precio-asc")).toEqual({
      key: "precio-asc",
      column: "price",
      ascending: true,
    });
  });

  it("resuelve precio-desc", () => {
    expect(resolveSort("precio-desc")).toEqual({
      key: "precio-desc",
      column: "price",
      ascending: false,
    });
  });

  it("resuelve recientes", () => {
    expect(resolveSort("recientes")).toEqual({
      key: "recientes",
      column: "created_at",
      ascending: false,
    });
  });

  it("usa destacados por defecto ante un valor desconocido", () => {
    expect(resolveSort("algo-invalido")).toEqual({
      key: "destacados",
      column: "is_featured",
      ascending: false,
    });
  });

  it("usa destacados por defecto si no se pasa valor", () => {
    expect(resolveSort(undefined)).toEqual({
      key: "destacados",
      column: "is_featured",
      ascending: false,
    });
  });
});
