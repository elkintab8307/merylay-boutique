"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { login } from "./actions";
import { getLocalCart, clearLocalCart } from "@/lib/cart/local-cart";
import { mergeGuestCart } from "@/lib/cart/merge-guest-cart-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo");
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginInput) => {
    setServerError(null);
    const result = await login(data);
    if ("error" in result) {
      setServerError(result.error);
      return;
    }

    const guestCart = getLocalCart();
    if (guestCart.length > 0) {
      await mergeGuestCart(guestCart);
      clearLocalCart();
    }

    router.push(redirectTo ?? result.destinoPorDefecto);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <label htmlFor="identifier" className="text-sm text-brand-ciruela">
          Usuario o correo electrónico
        </label>
        <Input id="identifier" {...register("identifier")} />
        {errors.identifier && (
          <p className="text-sm text-red-600">{errors.identifier.message}</p>
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
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        {isSubmitting ? "Ingresando..." : "Ingresar"}
      </Button>
    </form>
  );
}
