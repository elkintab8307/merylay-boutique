import { describe, expect, it } from "vitest";
import { ordenarHorario, horarioPorDefecto, DIAS_SEMANA } from "../horario";
import type { Horario } from "../horario";

describe("ordenarHorario", () => {
  it("reordena los dias al orden canonico lunes-domingo sin importar el orden de entrada", () => {
    const desordenado: Horario = [
      { dia: "domingo", abierto: false, desde: "09:00", hasta: "18:00" },
      { dia: "lunes", abierto: true, desde: "10:00", hasta: "19:00" },
      { dia: "miercoles", abierto: true, desde: "09:00", hasta: "18:00" },
      { dia: "martes", abierto: false, desde: "09:00", hasta: "18:00" },
      { dia: "jueves", abierto: false, desde: "09:00", hasta: "18:00" },
      { dia: "viernes", abierto: false, desde: "09:00", hasta: "18:00" },
      { dia: "sabado", abierto: false, desde: "09:00", hasta: "18:00" },
    ];

    const resultado = ordenarHorario(desordenado);

    expect(resultado.map((d) => d.dia)).toEqual([...DIAS_SEMANA]);
    expect(resultado[0].dia).toBe("lunes");
    expect(resultado[0].desde).toBe("10:00");
  });

  it("omite dias que no esten presentes en el arreglo de entrada", () => {
    const incompleto: Horario = horarioPorDefecto().filter((d) => d.dia !== "domingo") as Horario;
    const resultado = ordenarHorario(incompleto);
    expect(resultado).toHaveLength(6);
    expect(resultado.some((d) => d.dia === "domingo")).toBe(false);
  });

  it("devuelve arreglo vacio si la entrada esta vacia", () => {
    expect(ordenarHorario([])).toEqual([]);
  });
});

describe("horarioPorDefecto", () => {
  it("devuelve los 7 dias, todos cerrados", () => {
    const resultado = horarioPorDefecto();
    expect(resultado).toHaveLength(7);
    expect(resultado.every((d) => d.abierto === false)).toBe(true);
  });
});
