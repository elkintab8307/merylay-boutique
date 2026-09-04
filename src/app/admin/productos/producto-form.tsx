"use client";

import { useState } from "react";
import Image from "next/image";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { productoSchema, type ProductoInput } from "@/lib/validation/producto";
import { slugify } from "@/lib/slug";
import {
  createProducto,
  updateProducto,
  deleteProductImage,
  setPrimaryProductImage,
  toggleImagenVendida,
} from "./actions";
import {
  subirImagenesProductoCliente,
  type EstadoImagen,
  type ResultadoSubida,
} from "@/lib/admin/upload-product-images-client";
import { motivoARemedio } from "@/lib/admin/motivo-remedio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageUploadButton } from "@/components/admin/image-upload-button";

type CategoriaOption = { id: string; name: string };
type ProductImage = { id: string; url: string; is_primary: boolean; variant_id: string | null; vendida: boolean };

// Las imagenes se suben directo desde el navegador a Supabase Storage
// (ver upload-product-images-client.ts), no como parte del body de la
// Server Action — este limite es solo para evitar subidas descuidadas
// desde datos moviles, no para esquivar ningun limite de payload.
const MAX_IMAGENES_MB = 50;

export function ProductoForm({
  productoId,
  skuActual,
  codigoBarras,
  codigoQr,
  defaultValues,
  categoriasDisponibles,
  imagenesExistentes = [],
  onGuardado,
}: {
  productoId?: string;
  skuActual?: string;
  codigoBarras?: string;
  codigoQr?: string;
  defaultValues: ProductoInput;
  categoriasDisponibles: CategoriaOption[];
  imagenesExistentes?: ProductImage[];
  onGuardado?: () => void;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imageSizeError, setImageSizeError] = useState<string | null>(null);
  const [existingImages, setExistingImages] = useState(imagenesExistentes);
  const [variantImageFiles, setVariantImageFiles] = useState<File[][]>(
    defaultValues.variantes.map(() => []),
  );
  // Errores de subida ubicados por seccion. `clave` es "general" o
  // "variante-<indice>"; se usa tambien como id del bloque para hacer
  // scroll hasta el primer error. Ver onSubmit.
  const [erroresImagenes, setErroresImagenes] = useState<
    { clave: string; seccion: string; items: { nombre: string; motivo: string }[] }[]
  >([]);
  // Estado visible de cada imagen en su miniatura: comprimiendo / subiendo
  // / ok (chulo verde) / error (X roja). La subida va una por una y este
  // mapa se actualiza en cada paso (ver onSubmit -> marcarEstado).
  const [estadosImagenes, setEstadosImagenes] = useState<Map<File, EstadoImagen>>(
    new Map(),
  );
  // URL publica ya obtenida para cada File que subio bien en un intento
  // anterior. Sirve para reconstruir las URLs por seccion y para NO volver
  // a subir una imagen que ya quedo cuando el usuario pulsa "Guardar" otra
  // vez tras un fallo parcial.
  const [urlsSubidas, setUrlsSubidas] = useState<Map<File, string>>(new Map());

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProductoInput>({
    resolver: zodResolver(productoSchema),
    defaultValues,
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "variantes",
  });

  const variantesWatched = useWatch({ control, name: "variantes" }) ?? [];

  const handleAppendVariante = () => {
    append({ talla: "", color: "", priceOverride: null });
    setVariantImageFiles((prev) => [...prev, []]);
  };

  const handleRemoveVariante = (index: number) => {
    remove(index);
    setVariantImageFiles((prev) => prev.filter((_, i) => i !== index));
    setErroresImagenes((prev) => prev.filter((e) => e.clave !== `variante-${index}`));
  };

  const etiquetaVariante = (index: number) => {
    const v = variantesWatched[index];
    const partes = [
      v?.talla ? `Talla ${v.talla}` : null,
      v?.color ? v.color : null,
    ].filter(Boolean);
    return `Variante ${index + 1}${partes.length > 0 ? ` (${partes.join(" / ")})` : ""}`;
  };

  const renderErrorImagenes = (clave: string) => {
    const err = erroresImagenes.find((e) => e.clave === clave);
    if (!err || err.items.length === 0) return null;
    return (
      <div
        id={`error-imagenes-${clave}`}
        className="flex flex-col gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm"
      >
        <p className="font-medium text-red-700">
          No se {err.items.length === 1 ? "pudo subir esta imagen" : "pudieron subir estas imágenes"}{" "}
          de «{err.seccion}»:
        </p>
        <ul className="flex flex-col gap-2">
          {err.items.map((it) => {
            const remedio = motivoARemedio(it.motivo);
            return (
              <li key={it.nombre} className="text-brand-ciruela">
                <span className="font-medium">{it.nombre}</span> — {remedio.causa}
                <br />
                <span className="text-brand-ciruela/80">Qué hacer: {remedio.queHacer}</span>
              </li>
            );
          })}
        </ul>
        <p className="text-brand-ciruela/80">
          Las imágenes con ✓ ya quedaron guardadas; al pulsar «Guardar» solo se
          reintentan las que tienen ✗.
        </p>
      </div>
    );
  };

  const onSubmit = async (data: ProductoInput) => {
    setServerError(null);
    setErroresImagenes([]);
    try {
      // URLs conseguidas EN ESTE intento (fuente autoritativa dentro del
      // submit; el estado de React no se refresca a mitad de la funcion).
      const urlsDeEsteIntento = new Map<File, string>();

      const marcarEstado = (file: File, estado: EstadoImagen) => {
        setEstadosImagenes((prev) => new Map(prev).set(file, estado));
      };

      // Empareja cada File subido con su URL: `resultado.urls` viene en el
      // mismo orden que `pendientes`, saltando los que fallaron.
      const registrarUrls = (pendientes: File[], resultado: ResultadoSubida) => {
        const fallidos = new Set(resultado.fallos.map((f) => f.file));
        let i = 0;
        for (const file of pendientes) {
          if (fallidos.has(file)) continue;
          const url = resultado.urls[i++];
          if (url) urlsDeEsteIntento.set(file, url);
        }
      };

      const urlDe = (file: File) =>
        urlsDeEsteIntento.get(file) ?? urlsSubidas.get(file);

      const nuevosErrores: {
        clave: string;
        seccion: string;
        items: { nombre: string; motivo: string }[];
      }[] = [];

      const subirSeccion = async (
        clave: string,
        seccion: string,
        archivos: File[],
      ): Promise<string[]> => {
        const pendientes = archivos.filter((f) => !urlDe(f));
        if (pendientes.length > 0) {
          const resultado = await subirImagenesProductoCliente(pendientes, {
            onEstado: marcarEstado,
          });
          registrarUrls(pendientes, resultado);
          if (resultado.fallos.length > 0) {
            nuevosErrores.push({
              clave,
              seccion,
              items: resultado.fallos.map((f) => ({ nombre: f.nombre, motivo: f.motivo })),
            });
          }
        }
        return archivos.map(urlDe).filter((u): u is string => Boolean(u));
      };

      const imageUrls = await subirSeccion(
        "general",
        "Imágenes generales",
        imageFiles,
      );

      const variantImageUrls: string[][] = [];
      for (let i = 0; i < variantImageFiles.length; i++) {
        variantImageUrls[i] = await subirSeccion(
          `variante-${i}`,
          etiquetaVariante(i),
          variantImageFiles[i] ?? [],
        );
      }

      if (urlsDeEsteIntento.size > 0) {
        setUrlsSubidas((prev) => {
          const siguiente = new Map(prev);
          for (const [file, url] of urlsDeEsteIntento) siguiente.set(file, url);
          return siguiente;
        });
      }

      if (nuevosErrores.length > 0) {
        setErroresImagenes(nuevosErrores);
        requestAnimationFrame(() => {
          const primero = document.getElementById(
            `error-imagenes-${nuevosErrores[0].clave}`,
          );
          if (primero && typeof primero.scrollIntoView === "function") {
            primero.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        });
        return;
      }

      const result = productoId
        ? await updateProducto(productoId, data, imageUrls, variantImageUrls)
        : await createProducto(data, imageUrls, variantImageUrls);

      if (result?.error) {
        setServerError(result.error);
        return;
      }

      // Producto guardado: limpia las imagenes ya subidas para no
      // reenviarlas si el formulario sigue montado (caso modal).
      setUrlsSubidas(new Map());
      setEstadosImagenes(new Map());
      setImageFiles([]);
      setVariantImageFiles(variantImageFiles.map(() => []));

      if (onGuardado) {
        onGuardado();
      } else {
        router.push("/admin/productos");
        router.refresh();
      }
    } catch {
      // Cubre fallos que no llegan a devolver {error}: por ejemplo un
      // corte de conexion durante la subida — sin esto el formulario se
      // quedaba "guardando" sin ningun aviso.
      setServerError(
        "No se pudo guardar el producto. Si subiste varias imágenes, intenta con menos a la vez o revisa tu conexión.",
      );
    }
  };

  const validarTamanoTotal = (general: File[], porVariante: File[][]) => {
    const total =
      [general, ...porVariante].flat().reduce((sum, file) => sum + file.size, 0) /
      (1024 * 1024);

    if (total > MAX_IMAGENES_MB) {
      setImageSizeError(
        `Las imágenes seleccionadas pesan ${total.toFixed(1)} MB en total — el máximo es ${MAX_IMAGENES_MB} MB. Elige menos imágenes o comprímelas antes de subirlas.`,
      );
      return false;
    }
    setImageSizeError(null);
    return true;
  };

  const handleImageChange = (files: File[]) => {
    if (!validarTamanoTotal(files, variantImageFiles)) {
      setImageFiles([]);
      return;
    }
    setImageSizeError(null);
    setImageFiles(files);
  };

  const handleVariantImageChange = (index: number, files: File[]) => {
    const siguiente = variantImageFiles.map((f, i) => (i === index ? files : f));
    if (!validarTamanoTotal(imageFiles, siguiente)) {
      setVariantImageFiles(variantImageFiles.map((f, i) => (i === index ? [] : f)));
      return;
    }
    setVariantImageFiles(siguiente);
  };

  const handleDeleteImage = async (imageId: string) => {
    if (!productoId) return;
    const result = await deleteProductImage(imageId, productoId);
    if (!result.error) {
      setExistingImages((prev) => prev.filter((img) => img.id !== imageId));
    }
  };

  const handleSetPrimary = async (imageId: string) => {
    if (!productoId) return;
    const result = await setPrimaryProductImage(imageId, productoId);
    if (!result.error) {
      setExistingImages((prev) =>
        prev.map((img) => ({ ...img, is_primary: img.id === imageId })),
      );
    }
  };

  const handleToggleVendida = async (imageId: string, vendidaActual: boolean) => {
    if (!productoId) return;
    const result = await toggleImagenVendida(imageId, !vendidaActual, productoId);
    if (!result.error) {
      setExistingImages((prev) =>
        prev.map((img) => (img.id === imageId ? { ...img, vendida: !vendidaActual } : img)),
      );
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="name" className="text-sm text-brand-ciruela">
            Nombre
          </label>
          <Input
            id="name"
            {...register("name", {
              onChange: (e) => {
                if (!productoId) {
                  setValue("slug", slugify(e.target.value));
                }
              },
            })}
          />
          {errors.name && (
            <p className="text-sm text-red-600">{errors.name.message}</p>
          )}
        </div>
        <div>
          <label htmlFor="slug" className="text-sm text-brand-ciruela">
            Slug
          </label>
          <Input id="slug" {...register("slug")} />
          {errors.slug && (
            <p className="text-sm text-red-600">{errors.slug.message}</p>
          )}
        </div>
        <div>
          <label htmlFor="description" className="text-sm text-brand-ciruela">
            Descripción
          </label>
          <Input id="description" {...register("description")} />
        </div>
        <div>
          <label htmlFor="categoryId" className="text-sm text-brand-ciruela">
            Categoría
          </label>
          <select
            id="categoryId"
            className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
            {...register("categoryId", { setValueAs: (v) => (v === "" ? null : v) })}
          >
            <option value="">Sin categoría</option>
            {categoriasDisponibles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="price" className="text-sm text-brand-ciruela">
              Precio
            </label>
            <Input
              id="price"
              type="number"
              step="0.01"
              {...register("price", { valueAsNumber: true })}
            />
            {errors.price && (
              <p className="text-sm text-red-600">{errors.price.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="promoPrice" className="text-sm text-brand-ciruela">
              Precio Promoción
            </label>
            <Input
              id="promoPrice"
              type="number"
              step="0.01"
              {...register("promoPrice", {
                setValueAs: (v) => (v === "" ? null : Number(v)),
              })}
            />
            <p className="text-xs text-brand-ciruela/60">
              Déjalo en 0 para quitar la promoción.
            </p>
          </div>
          <div>
            <label htmlFor="costPrice" className="text-sm text-brand-ciruela">
              Costo de compra
            </label>
            <Input
              id="costPrice"
              type="number"
              step="0.01"
              {...register("costPrice", {
                setValueAs: (v) => (v === "" ? null : Number(v)),
              })}
            />
            <p className="text-xs text-brand-ciruela/60">
              Información interna. No se muestra en la tienda pública.
            </p>
            {errors.costPrice && (
              <p className="text-sm text-red-600">{errors.costPrice.message}</p>
            )}
          </div>
        </div>
        {skuActual && (
          <p className="text-xs text-brand-ciruela/60">
            SKU:{" "}
            <span className="font-medium text-brand-ciruela">{skuActual}</span>
          </p>
        )}
        {(codigoBarras || codigoQr) && (
          <div className="flex flex-wrap gap-6">
            {codigoBarras && (
              <div className="flex flex-col gap-1">
                <p className="text-xs text-brand-ciruela/60">Código de barras</p>
                <Image
                  src={codigoBarras}
                  alt={`Código de barras ${skuActual ?? ""}`}
                  width={300}
                  height={100}
                  unoptimized
                  className="h-20 w-auto rounded-md border border-brand-rosa-claro bg-white p-2"
                />
              </div>
            )}
            {codigoQr && (
              <div className="flex flex-col gap-1">
                <p className="text-xs text-brand-ciruela/60">Código QR</p>
                <Image
                  src={codigoQr}
                  alt={`Código QR ${skuActual ?? ""}`}
                  width={150}
                  height={150}
                  unoptimized
                  className="h-24 w-24 rounded-md border border-brand-rosa-claro bg-white p-2"
                />
              </div>
            )}
            <p className="w-full text-xs text-brand-ciruela/60">
              Para uso interno. Se usará más adelante para imprimir etiquetas.
            </p>
          </div>
        )}
        {fields.length > 0 ? (
          <div>
            <span className="text-sm text-brand-ciruela">Stock</span>
            <p className="flex min-h-10 flex-wrap items-center gap-x-2 text-sm text-brand-ciruela">
              {existingImages.filter((img) => img.variant_id !== null && !img.vendida).length}{" "}
              unidades
              <span className="text-xs text-brand-ciruela/60">
                — se calcula solo, sumando las fotos disponibles de cada variante
              </span>
            </p>
          </div>
        ) : (
          <div>
            <label htmlFor="stock" className="text-sm text-brand-ciruela">
              Stock
            </label>
            <Input
              id="stock"
              type="number"
              {...register("stock", { valueAsNumber: true })}
            />
            {errors.stock && (
              <p className="text-sm text-red-600">{errors.stock.message}</p>
            )}
          </div>
        )}
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm text-brand-ciruela">
            <input type="checkbox" {...register("isActive")} />
            Activo
          </label>
          <label className="flex items-center gap-2 text-sm text-brand-ciruela">
            <input type="checkbox" {...register("isFeatured")} />
            Destacado
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg text-brand-ciruela">Variantes</h2>
          <Button
            type="button"
            variant="outline"
            onClick={handleAppendVariante}
            className="border-brand-rosa text-brand-rosa hover:bg-brand-rosa/10"
          >
            Agregar variante
          </Button>
        </div>
        {fields.map((field, index) => {
          const variantId = variantesWatched[index]?.id;
          const imagenesDeVariante = variantId
            ? existingImages.filter((img) => img.variant_id === variantId)
            : [];

          return (
            <div
              key={field.id}
              className="flex flex-col gap-3 rounded-md border border-brand-rosa-claro p-3"
            >
              <input
                type="hidden"
                {...register(`variantes.${index}.id` as const, {
                  setValueAs: (v) => (v === "" ? undefined : v),
                })}
              />
              <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4">
                <div>
                  <label className="text-xs text-brand-ciruela">Talla</label>
                  <Input {...register(`variantes.${index}.talla` as const)} />
                </div>
                <div>
                  <label className="text-xs text-brand-ciruela">Color</label>
                  <Input {...register(`variantes.${index}.color` as const)} />
                </div>
                <div>
                  <label className="text-xs text-brand-ciruela">Disponibles</label>
                  <p className="flex h-9 items-center text-sm text-brand-ciruela">
                    {imagenesDeVariante.length > 0
                      ? `${imagenesDeVariante.filter((img) => !img.vendida).length} disponibles`
                      : "Sin fotos"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleRemoveVariante(index)}
                  className="border-brand-rosa text-brand-rosa hover:bg-brand-rosa/10"
                >
                  Quitar
                </Button>
                {errors.variantes?.[index]?.talla && (
                  <p className="col-span-4 text-sm text-red-600">
                    {errors.variantes[index]?.talla?.message}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <label
                  htmlFor={`variant-images-${index}`}
                  className="text-xs text-brand-ciruela"
                >
                  Imágenes de esta variante
                </label>
                {imagenesDeVariante.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {imagenesDeVariante.map((image) => (
                      <div key={image.id} className="flex flex-col items-center gap-1">
                        <Image
                          src={image.url}
                          alt=""
                          width={80}
                          height={80}
                          className="h-20 w-20 rounded-md border border-brand-rosa-claro object-cover"
                        />
                        <span className="text-xs text-brand-ciruela">
                          {image.is_primary ? "Principal" : ""}
                        </span>
                        <div className="flex gap-2 text-xs">
                          {!image.is_primary && (
                            <button
                              type="button"
                              onClick={() => handleSetPrimary(image.id)}
                              className="text-brand-rosa hover:underline"
                            >
                              Marcar principal
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteImage(image.id)}
                            className="text-red-600 hover:underline"
                          >
                            Eliminar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleVendida(image.id, image.vendida)}
                            className="text-brand-rosa hover:underline"
                          >
                            {image.vendida ? "Marcar disponible" : "Marcar vendida"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <ImageUploadButton
                  id={`variant-images-${index}`}
                  files={variantImageFiles[index] ?? []}
                  onChange={(files) => handleVariantImageChange(index, files)}
                  label={`Imágenes de la variante ${index + 1}`}
                  estados={estadosImagenes}
                />
                {renderErrorImagenes(`variante-${index}`)}
              </div>
            </div>
          );
        })}
        {(errors.variantes?.root?.message ?? errors.variantes?.message) && (
          <p className="text-sm text-red-600">
            {errors.variantes?.root?.message ?? errors.variantes?.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-lg text-brand-ciruela">Imágenes generales</h2>
        {existingImages.filter((img) => img.variant_id === null).length > 0 && (
          <div className="flex flex-wrap gap-3">
            {existingImages
              .filter((img) => img.variant_id === null)
              .map((image) => (
              <div key={image.id} className="flex flex-col items-center gap-1">
                <Image
                  src={image.url}
                  alt=""
                  width={96}
                  height={96}
                  className="h-24 w-24 rounded-md border border-brand-rosa-claro object-cover"
                />
                <span className="text-xs text-brand-ciruela">
                  {image.is_primary ? "Principal" : ""}
                </span>
                <div className="flex gap-2 text-xs">
                  {!image.is_primary && (
                    <button
                      type="button"
                      onClick={() => handleSetPrimary(image.id)}
                      className="text-brand-rosa hover:underline"
                    >
                      Marcar principal
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteImage(image.id)}
                    className="text-red-600 hover:underline"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <ImageUploadButton
          id="general-images"
          files={imageFiles}
          onChange={handleImageChange}
          estados={estadosImagenes}
        />
        {imageSizeError && <p className="text-sm text-red-600">{imageSizeError}</p>}
        {renderErrorImagenes("general")}
      </div>

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        {isSubmitting ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
