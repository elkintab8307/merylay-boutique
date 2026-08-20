import { describe, expect, it } from "vitest";
import { calificacionSchema } from "../calificacion";

describe("calificacionSchema", () => {
  it("acepta una calificacion valida sin comentario", () => {
    expect(calificacionSchema.safeParse({ rating: 5, comment: "" }).success).toBe(true);
  });

  it("acepta una calificacion valida con comentario", () => {
    expect(
      calificacionSchema.safeParse({ rating: 4, comment: "Me encanto la tela" }).success,
    ).toBe(true);
  });

  it("rechaza rating menor a 1", () => {
    expect(calificacionSchema.safeParse({ rating: 0, comment: "" }).success).toBe(false);
  });

  it("rechaza rating mayor a 5", () => {
    expect(calificacionSchema.safeParse({ rating: 6, comment: "" }).success).toBe(false);
  });

  it("rechaza rating no entero", () => {
    expect(calificacionSchema.safeParse({ rating: 3.5, comment: "" }).success).toBe(false);
  });

  it("rechaza un comentario demasiado largo", () => {
    expect(
      calificacionSchema.safeParse({ rating: 5, comment: "a".repeat(501) }).success,
    ).toBe(false);
  });
});
