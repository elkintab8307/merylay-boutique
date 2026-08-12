"use client";

import { useState } from "react";
import Image from "next/image";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { productoSchema, type ProductoInput } from "@/lib/validation/producto";
import { slugify } from "@/lib/slug";
import {
  createProducto,
  updateProducto,
  deleteProductImage,
  setPrimaryProductImage,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CategoriaOption = { id: string; name: string };
type ProductImage = { id: string; url: string; is_primary: boolean };

export function ProductoForm({
  productoId,
  skuActual,
  codigoBarras,
  codigoQr,
  defaultValues,
  categoriasDisponibles,
  imagenesExistentes = [],
}: {
  productoId?: string;
  skuActual?: string;
  codigoBarras?: string;
  codigoQr?: string;
  defaultValues: ProductoInput;
  categoriasDisponibles: CategoriaOption[];
  imagenesExistentes?: ProductImage[];
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState(imagenesExistentes);

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

  const onSubmit = async (data: ProductoInput) => {
    setServerError(null);
    const result = productoId
      ? await updateProducto(productoId, data, imageFiles)
      : await createProducto(data, imageFiles);

    if (result?.error) {
      setServerError(result.error);
      return;
    }

    router.push("/admin/productos");
    router.refresh();
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
            <label htmlFor="compareAtPrice" className="text-sm text-brand-ciruela">
              Precio de comparación
            </label>
            <Input
              id="compareAtPrice"
              type="number"
              step="0.01"
              {...register("compareAtPrice", {
                setValueAs: (v) => (v === "" ? null : Number(v)),
              })}
            />
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
            onClick={() =>
              append({ talla: "", color: "", priceOverride: null, stock: 0 })
            }
            className="border-brand-rosa text-brand-rosa hover:bg-brand-rosa/10"
          >
            Agregar variante
          </Button>
        </div>
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="grid grid-cols-2 items-end gap-2 rounded-md border border-brand-rosa-claro p-3 sm:grid-cols-4"
          >
            <div>
              <label className="text-xs text-brand-ciruela">Talla</label>
              <Input {...register(`variantes.${index}.talla` as const)} />
            </div>
            <div>
              <label className="text-xs text-brand-ciruela">Color</label>
              <Input {...register(`variantes.${index}.color` as const)} />
            </div>
            <div>
              <label className="text-xs text-brand-ciruela">Stock</label>
              <Input
                type="number"
                {...register(`variantes.${index}.stock` as const, {
                  valueAsNumber: true,
                })}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => remove(index)}
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
        ))}
        {(errors.variantes?.root?.message ?? errors.variantes?.message) && (
          <p className="text-sm text-red-600">
            {errors.variantes?.root?.message ?? errors.variantes?.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-lg text-brand-ciruela">Imágenes</h2>
        {existingImages.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {existingImages.map((image) => (
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
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setImageFiles(Array.from(e.target.files ?? []))}
        />
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
