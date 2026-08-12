"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { horarioSchema, DIA_LABEL, type Horario } from "@/lib/validation/horario";
import { guardarHorario } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const formSchema = z.object({ dias: horarioSchema });
type FormValues = z.infer<typeof formSchema>;

export function HorarioForm({ defaultValues }: { defaultValues: Horario }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { dias: defaultValues },
  });

  const { fields } = useFieldArray({ control, name: "dias" });
  const diasActuales = watch("dias");

  const onSubmit = async (data: FormValues) => {
    setServerError(null);
    setSuccess(false);
    try {
      const result = await guardarHorario(data.dias);
      if (result?.error) {
        setServerError(result.error);
        return;
      }
      setSuccess(true);
    } catch {
      setServerError("No se pudo guardar el horario.");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-xl flex-col gap-3">
      {fields.map((field, index) => (
        <div key={field.id} className="flex flex-wrap items-center gap-3">
          <span className="w-24 text-sm text-brand-ciruela">{DIA_LABEL[field.dia]}</span>
          <label className="flex items-center gap-1 text-xs text-brand-ciruela">
            <input type="checkbox" {...register(`dias.${index}.abierto` as const)} />
            Abierto
          </label>
          <Input
            type="time"
            disabled={!diasActuales[index]?.abierto}
            className="w-28"
            {...register(`dias.${index}.desde` as const)}
          />
          <Input
            type="time"
            disabled={!diasActuales[index]?.abierto}
            className="w-28"
            {...register(`dias.${index}.hasta` as const)}
          />
        </div>
      ))}
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      {success && <p className="text-sm text-green-700">Horario guardado correctamente.</p>}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-fit bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        {isSubmitting ? "Guardando..." : "Guardar horario"}
      </Button>
    </form>
  );
}
