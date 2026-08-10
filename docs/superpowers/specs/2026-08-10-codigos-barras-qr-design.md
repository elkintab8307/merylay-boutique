# Código de barras y QR automáticos — Diseño

## Objetivo

Mostrar, en la página de editar producto, un código de barras y un código
QR generados automáticamente a partir del SKU del producto — sin captura
manual ni almacenamiento en base de datos — como base para un futuro
módulo de impresión de etiquetas (fuera de alcance de este diseño).

## Alcance

1. Dos funciones puras en `src/lib/codigos.ts` que generan, a partir de un
   texto (el SKU), una imagen en formato `data:image/png;base64,...`:
   una con el código de barras (Code128) y otra con el código QR.
2. La página `/admin/productos/[id]/editar` genera ambas imágenes a partir
   de `producto.sku` y las pasa a `ProductoForm`.
3. `ProductoForm` muestra ambas imágenes, de solo lectura, junto al SKU
   ya existente — solo en modo edición (no aplica a `/admin/productos/nuevo`,
   donde el SKU todavía no existe).

Fuera de alcance: impresión de etiquetas (fase futura), códigos por
variante, almacenamiento del código generado, edición manual del
contenido codificado, escaneo/lectura de códigos.

## Librerías (ya instaladas y verificadas en vivo)

- `qrcode` (`QRCode.toDataURL(texto): Promise<string>`) — genera el QR
  directamente como PNG en base64, sin pasos intermedios.
- `bwip-js` (`bwipjs.toBuffer(opciones): Promise<Buffer>`) — genera el
  código de barras como un `Buffer` PNG, que se codifica a base64 a mano
  (`data:image/png;base64,${buffer.toString("base64")}`). Symbología
  `code128`, que admite letras, números y guiones — exactamente el
  alfabeto del SKU (`PIJ-000001`).
- `@types/qrcode` como dependencia de desarrollo (el paquete `qrcode` no
  trae sus propios tipos). `bwip-js` sí trae los suyos.

Ambas se ejecutan del lado del servidor (Node), sin canvas ni DOM — encajan
con el patrón de este proyecto de Server Components por defecto.

## Arquitectura

### `src/lib/codigos.ts`

```ts
import QRCode from "qrcode";
import bwipjs from "bwip-js";

export async function generarCodigoQr(texto: string): Promise<string> {
  return QRCode.toDataURL(texto);
}

export async function generarCodigoBarras(texto: string): Promise<string> {
  const png = await bwipjs.toBuffer({
    bcid: "code128",
    text: texto,
    scale: 3,
    height: 10,
    includetext: true,
    textxalign: "center",
  });
  return `data:image/png;base64,${png.toString("base64")}`;
}
```

Ninguna de las dos toca Supabase ni requiere autenticación propia — son
funciones puras (mismo texto de entrada siempre produce la misma imagen).
La autorización ya está cubierta por el middleware de `/admin/**`, que
protege la única página que las invoca.

### Página de editar

`[id]/editar/page.tsx` ya hace `Promise.all` de varias consultas después
de obtener `producto` (que incluye `producto.sku`). Se agregan las dos
llamadas de generación a ese mismo `Promise.all`, y los resultados se
pasan a `ProductoForm` como dos props nuevas: `codigoBarras: string` y
`codigoQr: string` (ambas opcionales, como `skuActual`, para que
`nuevo/page.tsx` no las use).

### Formulario

Junto a la línea de solo lectura del SKU (ya existente desde la fase de
SKU automático), cuando `codigoBarras`/`codigoQr` vienen definidos, se
muestran dos imágenes con `next/image` (`unoptimized`, ya que son
data URIs generados en el momento, no assets a optimizar), cada una con su
etiqueta y una nota de que es para uso interno / futuras etiquetas —
mismo tono que la nota ya existente bajo "Costo de compra".

## Testing

- TDD sobre `generarCodigoQr`/`generarCodigoBarras`: confirman que el
  resultado es un string no vacío que empieza con
  `data:image/png;base64,` y tiene una longitud razonable (no se compara
  el contenido binario exacto, sería frágil) — mismo criterio de test que
  ya se usa en este proyecto para funciones puras sobre datos generados
  (ej. `generarSkuVariante`).
- No aplica verificación en vivo contra Supabase (no hay tabla ni RPC
  nueva); la verificación de integración se limita a build/lint/test y, si
  es posible, un vistazo manual a `/admin/productos/[id]/editar` con un
  producto real.

## UI

Sigue el patrón visual ya establecido en `ProductoForm`: texto auxiliar en
`text-xs text-brand-ciruela/60`, imágenes con borde `border-brand-rosa-claro`
como las imágenes de producto ya existentes en el mismo formulario.
