"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  storeSettingsSchema,
  type StoreSettingsInput,
} from "@/lib/validation/store-settings";
import { guardarAjustes } from "./actions";

export function AjustesForm({
  defaultValues,
}: {
  defaultValues: StoreSettingsInput;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StoreSettingsInput>({
    resolver: zodResolver(storeSettingsSchema),
    defaultValues,
  });

  const onSubmit = async (data: StoreSettingsInput) => {
    setServerError(null);
    setSuccess(false);
    const result = await guardarAjustes(data);
    if (result?.error) {
      setServerError(result.error);
      return;
    }
    setSuccess(true);
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex max-w-xl flex-col gap-6"
    >
      <div className="flex flex-col gap-4">
        <h2 className="font-heading text-lg text-brand-ciruela">
          Datos generales
        </h2>
        <div>
          <label htmlFor="nombreTienda" className="text-sm text-brand-ciruela">
            Nombre de la tienda
          </label>
          <Input id="nombreTienda" {...register("nombreTienda")} />
          {errors.nombreTienda && (
            <p className="text-sm text-red-600">
              {errors.nombreTienda.message}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="contactoEmail" className="text-sm text-brand-ciruela">
            Correo de contacto
          </label>
          <Input id="contactoEmail" {...register("contactoEmail")} />
          {errors.contactoEmail && (
            <p className="text-sm text-red-600">
              {errors.contactoEmail.message}
            </p>
          )}
        </div>
        <div>
          <label
            htmlFor="contactoTelefono"
            className="text-sm text-brand-ciruela"
          >
            Teléfono de contacto
          </label>
          <Input id="contactoTelefono" {...register("contactoTelefono")} />
          {errors.contactoTelefono && (
            <p className="text-sm text-red-600">
              {errors.contactoTelefono.message}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="font-heading text-lg text-brand-ciruela">Envío</h2>
        <div>
          <label
            htmlFor="envioCostoDefecto"
            className="text-sm text-brand-ciruela"
          >
            Costo de envío por defecto (COP)
          </label>
          <Input
            id="envioCostoDefecto"
            type="number"
            {...register("envioCostoDefecto", { valueAsNumber: true })}
          />
          {errors.envioCostoDefecto && (
            <p className="text-sm text-red-600">
              {errors.envioCostoDefecto.message}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="font-heading text-lg text-brand-ciruela">
          Redes sociales
        </h2>
        <div>
          <label
            htmlFor="redesInstagram"
            className="text-sm text-brand-ciruela"
          >
            Instagram
          </label>
          <Input id="redesInstagram" {...register("redesInstagram")} />
          {errors.redesInstagram && (
            <p className="text-sm text-red-600">
              {errors.redesInstagram.message}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="redesFacebook" className="text-sm text-brand-ciruela">
            Facebook
          </label>
          <Input id="redesFacebook" {...register("redesFacebook")} />
          {errors.redesFacebook && (
            <p className="text-sm text-red-600">
              {errors.redesFacebook.message}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="redesTiktok" className="text-sm text-brand-ciruela">
            TikTok
          </label>
          <Input id="redesTiktok" {...register("redesTiktok")} />
          {errors.redesTiktok && (
            <p className="text-sm text-red-600">{errors.redesTiktok.message}</p>
          )}
        </div>
        <div>
          <label
            htmlFor="redesWhatsapp"
            className="text-sm text-brand-ciruela"
          >
            WhatsApp
          </label>
          <Input id="redesWhatsapp" {...register("redesWhatsapp")} />
          {errors.redesWhatsapp && (
            <p className="text-sm text-red-600">
              {errors.redesWhatsapp.message}
            </p>
          )}
        </div>
      </div>

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      {success && (
        <p className="text-sm text-green-700">
          Ajustes guardados correctamente.
        </p>
      )}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-fit bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        Guardar cambios
      </Button>
    </form>
  );
}
