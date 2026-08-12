import { z } from "zod";

export const DIAS_SEMANA = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
] as const;

export type DiaSemana = (typeof DIAS_SEMANA)[number];

export const DIA_LABEL: Record<DiaSemana, string> = {
  lunes: "Lunes",
  martes: "Martes",
  miercoles: "Miércoles",
  jueves: "Jueves",
  viernes: "Viernes",
  sabado: "Sábado",
  domingo: "Domingo",
};

const horarioDiaSchema = z.object({
  dia: z.enum(DIAS_SEMANA),
  abierto: z.boolean(),
  desde: z.string(),
  hasta: z.string(),
});

export const horarioSchema = z.array(horarioDiaSchema).length(7);

export type HorarioDia = z.infer<typeof horarioDiaSchema>;
export type Horario = z.infer<typeof horarioSchema>;

export function horarioPorDefecto(): Horario {
  return DIAS_SEMANA.map((dia) => ({
    dia,
    abierto: false,
    desde: "09:00",
    hasta: "18:00",
  }));
}

export function ordenarHorario(horario: Horario): Horario {
  return DIAS_SEMANA.map((dia) => horario.find((h) => h.dia === dia)).filter(
    (h): h is HorarioDia => Boolean(h),
  );
}
