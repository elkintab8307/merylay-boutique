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
import { subirImagenBannerCliente } from "@/lib/admin/upload-banner-image-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageUploadButton } from "@/components/admin/image-upload-button";

export function HomeContenidoForm({
  defaultValues,
  heroImagenesDesktopActuales,
  heroImagenesMobileActuales,
  banner1ImageActual,
  banner2ImageActual,
}: {
  defaultValues: HomeContenidoInput;
  heroImagenesDesktopActuales: string[];
  heroImagenesMobileActuales: string[];
  banner1ImageActual: string | null;
  banner2ImageActual: string | null;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [heroDesktopFiles, setHeroDesktopFiles] = useState<File[]>([]);
  const [heroMobileFiles, setHeroMobileFiles] = useState<File[]>([]);
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

  const subirImagenes = async (files: File[], prefijo: string): Promise<string[] | null> => {
    const resultados = await Promise.all(
      files.map((file) => subirImagenBannerCliente(file, prefijo)),
    );
    const conError = resultados.find((r) => r.error);
    if (conError) {
      setServerError(conError.error ?? "No se pudo subir una de las imágenes.");
      return null;
    }
    return resultados.map((r) => r.url).filter((url): url is string => Boolean(url));
  };

  const onSubmit = async (data: HomeContenidoInput) => {
    setServerError(null);
    setSuccess(false);
    try {
      // Las imagenes se suben directo desde el navegador a Supabase
      // Storage (RLS ya restringe la escritura a superadmin), en vez de
      // pasarlas por la Server Action: asi evitamos el limite de payload
      // de las funciones serverless de Vercel (~4.5MB) al subir varias
      // imagenes a la vez para el carrusel del hero.
      let imagenesDesktop = heroImagenesDesktopActuales;
      if (heroDesktopFiles.length > 0) {
        const subidas = await subirImagenes(heroDesktopFiles, "hero");
        if (!subidas) return;
        imagenesDesktop = subidas;
      }

      let imagenesMobile = heroImagenesMobileActuales;
      if (heroMobileFiles.length > 0) {
        const subidas = await subirImagenes(heroMobileFiles, "hero-movil");
        if (!subidas) return;
        imagenesMobile = subidas;
      }

      let banner1ImageUrl = banner1ImageActual;
      if (banner1ImageFile) {
        const resultado = await subirImagenBannerCliente(banner1ImageFile, "banner1");
        if (resultado.error) {
          setServerError(resultado.error);
          return;
        }
        banner1ImageUrl = resultado.url ?? banner1ImageActual;
      }

      let banner2ImageUrl = banner2ImageActual;
      if (banner2ImageFile) {
        const resultado = await subirImagenBannerCliente(banner2ImageFile, "banner2");
        if (resultado.error) {
          setServerError(resultado.error);
          return;
        }
        banner2ImageUrl = resultado.url ?? banner2ImageActual;
      }

      const result = await guardarContenidoHome(
        data,
        imagenesDesktop,
        imagenesMobile,
        banner1ImageUrl,
        banner2ImageUrl,
      );
      if (result?.error) {
        setServerError(result.error);
        return;
      }
      setSuccess(true);
    } catch {
      setServerError(
        "No se pudo guardar el contenido de inicio. Verifica tu conexión e intenta de nuevo.",
      );
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-xl flex-col gap-8">
      <div className="flex flex-col gap-4">
        <h3 className="font-heading text-base text-brand-ciruela">
          Hero de la tienda
        </h3>
        <div>
          <label className="text-sm text-brand-ciruela">
            Imágenes para PC (horizontal, hasta 3 — se muestran en carrusel)
          </label>
          {heroImagenesDesktopActuales.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {heroImagenesDesktopActuales.map((url) => (
                <Image
                  key={url}
                  src={url}
                  alt=""
                  width={120}
                  height={67}
                  className="h-16 w-28 rounded-md object-cover"
                />
              ))}
            </div>
          )}
          <ImageUploadButton
            id="hero-imagenes-pc"
            multiple
            label="Elegir hasta 3 imágenes de PC"
            files={heroDesktopFiles}
            onChange={(files) => setHeroDesktopFiles(files.slice(0, 3))}
          />
          <p className="mt-1 text-xs text-brand-ciruela/60">
            Si eliges imágenes nuevas, reemplazan por completo las actuales.
          </p>
        </div>
        <div>
          <label className="text-sm text-brand-ciruela">
            Imágenes para móvil (vertical, hasta 3)
          </label>
          {heroImagenesMobileActuales.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {heroImagenesMobileActuales.map((url) => (
                <Image
                  key={url}
                  src={url}
                  alt=""
                  width={80}
                  height={120}
                  className="h-24 w-16 rounded-md object-cover"
                />
              ))}
            </div>
          )}
          <ImageUploadButton
            id="hero-imagenes-movil"
            multiple
            label="Elegir hasta 3 imágenes para móvil"
            files={heroMobileFiles}
            onChange={(files) => setHeroMobileFiles(files.slice(0, 3))}
          />
          <p className="mt-1 text-xs text-brand-ciruela/60">
            Si eliges imágenes nuevas, reemplazan por completo las actuales.
          </p>
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
        <ImageUploadButton
          id="banner1-imagen"
          multiple={false}
          label="Elegir imagen"
          files={banner1ImageFile ? [banner1ImageFile] : []}
          onChange={(files) => setBanner1ImageFile(files[0] ?? null)}
        />
        <p className="text-xs text-brand-ciruela/60">
          El título es opcional: déjalo vacío si la imagen ya incluye su
          propio texto y diseño.
        </p>
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
        <ImageUploadButton
          id="banner2-imagen"
          multiple={false}
          label="Elegir imagen"
          files={banner2ImageFile ? [banner2ImageFile] : []}
          onChange={(files) => setBanner2ImageFile(files[0] ?? null)}
        />
        <p className="text-xs text-brand-ciruela/60">
          El título es opcional: déjalo vacío si la imagen ya incluye su
          propio texto y diseño.
        </p>
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
