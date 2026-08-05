"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registroSchema, type RegistroInput } from "@/lib/validation/auth";
import { registro } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RegistroForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegistroInput>({ resolver: zodResolver(registroSchema) });

  const onSubmit = async (data: RegistroInput) => {
    setServerError(null);
    setSuccessMessage(null);
    const result = await registro(data);
    if (result?.error) {
      setServerError(result.error);
    } else if (result?.message) {
      setSuccessMessage(result.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <label htmlFor="fullName" className="text-sm text-brand-ciruela">
          Nombre completo
        </label>
        <Input id="fullName" {...register("fullName")} />
        {errors.fullName && (
          <p className="text-sm text-red-600">{errors.fullName.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="email" className="text-sm text-brand-ciruela">
          Correo electrónico
        </label>
        <Input id="email" type="email" {...register("email")} />
        {errors.email && (
          <p className="text-sm text-red-600">{errors.email.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="password" className="text-sm text-brand-ciruela">
          Contraseña
        </label>
        <Input id="password" type="password" {...register("password")} />
        {errors.password && (
          <p className="text-sm text-red-600">{errors.password.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="confirmPassword" className="text-sm text-brand-ciruela">
          Confirmar contraseña
        </label>
        <Input
          id="confirmPassword"
          type="password"
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <p className="text-sm text-red-600">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      {successMessage && (
        <p className="text-sm text-brand-oro">{successMessage}</p>
      )}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        {isSubmitting ? "Creando cuenta..." : "Crear cuenta"}
      </Button>
    </form>
  );
}
