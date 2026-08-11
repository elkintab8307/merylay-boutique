"use client";

import { useState } from "react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  homeContenidoSchema,
  type HomeContenidoInput,
} from "@/lib/validation/home-contenido";
import { guardarContenidoHome } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function HomeContenidoForm({
  defaultValues,
  heroImageActual,
  banner1ImageActual,
  banner2ImageActual,
}: {
  defaultValues: HomeContenidoInput;
  heroImageActual: string | null;
  banner1ImageActual: string | null;
  banner2ImageActual: string | null;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [heroImageFile, setHeroImageFile] = useState<File | null>(null);
  const [banner1ImageFile, setBanner1ImageFile] = useState<File | null>(null);
  const [banner2ImageFile, setBanner2ImageFile] = useState<File | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<HomeContenidoInput>({
    resolver: zodResolver(homeContenidoSchema),
    defaultValues,
  });

  const onSubmit = async (data: HomeContenidoInput) => {
    setServerError(null);
    setSuccess(false);
    try {
      const result = await guardarContenidoHome(
        data,
        heroImageFile,
        banner1ImageFile,
        banner2ImageFile,
        heroImageActual,
        banner1ImageActual,
        banner2ImageActual,
      );
      if (result?.error) {
        setServerError(result.error);
        return;
      }
      setSuccess(true);
    } catch {
      setServerError(
        "No se pudo guardar el contenido de inicio. Verifica que las imágenes no superen los 8MB.",
      );
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-xl flex-col gap-8">
      <div className="flex flex-col gap-4">
        <h3 className="font-heading text-base text-brand-ciruela">
          Hero de la tienda
        </h3>
        {heroImageActual && (
          <Image
            src={heroImageActual}
            alt=""
            width={400}
            height={224}
            className="h-28 w-full rounded-md object-cover"
          />
        )}
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setHeroImageFile(e.target.files?.[0] ?? null)}
        />
        <div>
          <label htmlFor="heroTitulo" className="text-sm text-brand-ciruela">
            Título
          </label>
          <Input id="heroTitulo" {...register("hero.titulo")} />
          {errors.hero?.titulo && (
            <p className="text-sm text-red-600">{errors.hero.titulo.message}</p>
          )}
        </div>
        <div>
          <label htmlFor="heroSubtitulo" className="text-sm text-brand-ciruela">
            Subtítulo
          </label>
          <Input id="heroSubtitulo" {...register("hero.subtitulo")} />
        </div>
        <div>
          <label htmlFor="heroTextoBoton" className="text-sm text-brand-ciruela">
            Texto del botón
          </label>
          <Input id="heroTextoBoton" {...register("hero.textoBoton")} />
          {errors.hero?.textoBoton && (
            <p className="text-sm text-red-600">
              {errors.hero.textoBoton.message}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="heroLinkBoton" className="text-sm text-brand-ciruela">
            Link del botón (ej. /categoria/pijamas)
          </label>
          <Input id="heroLinkBoton" {...register("hero.linkBoton")} />
          {errors.hero?.linkBoton && (
            <p className="text-sm text-red-600">
              {errors.hero.linkBoton.message}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="font-heading text-base text-brand-ciruela">
          Banner de colección 1
        </h3>
        {banner1ImageActual && (
          <Image
            src={banner1ImageActual}
            alt=""
            width={400}
            height={224}
            className="h-28 w-full rounded-md object-cover"
          />
        )}
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setBanner1ImageFile(e.target.files?.[0] ?? null)}
        />
        <div>
          <label htmlFor="banner1Titulo" className="text-sm text-brand-ciruela">
            Título
          </label>
          <Input id="banner1Titulo" {...register("banner1.titulo")} />
        </div>
        <div>
          <label htmlFor="banner1Link" className="text-sm text-brand-ciruela">
            Link (ej. /categoria/pijamas)
          </label>
          <Input id="banner1Link" {...register("banner1.link")} />
          {errors.banner1?.link && (
            <p className="text-sm text-red-600">{errors.banner1.link.message}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="font-heading text-base text-brand-ciruela">
          Banner de colección 2
        </h3>
        {banner2ImageActual && (
          <Image
            src={banner2ImageActual}
            alt=""
            width={400}
            height={224}
            className="h-28 w-full rounded-md object-cover"
          />
        )}
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setBanner2ImageFile(e.target.files?.[0] ?? null)}
        />
        <div>
          <label htmlFor="banner2Titulo" className="text-sm text-brand-ciruela">
            Título
          </label>
          <Input id="banner2Titulo" {...register("banner2.titulo")} />
        </div>
        <div>
          <label htmlFor="banner2Link" className="text-sm text-brand-ciruela">
            Link (ej. /categoria/pijamas)
          </label>
          <Input id="banner2Link" {...register("banner2.link")} />
          {errors.banner2?.link && (
            <p className="text-sm text-red-600">{errors.banner2.link.message}</p>
          )}
        </div>
      </div>

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      {success && (
        <p className="text-sm text-green-700">
          Contenido del inicio guardado correctamente.
        </p>
      )}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-fit bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        {isSubmitting ? "Guardando..." : "Guardar contenido de inicio"}
      </Button>
    </form>
  );
}
