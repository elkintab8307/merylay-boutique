# Pulido visual de Admin y POS

## Objetivo

Cerrar el cabo suelto señalado en el cierre de la Fase C: el panel
admin y el POS recibieron el trabajo funcional de responsividad, pero
nunca recibieron el pulido visual de marca (sombras `shadow-brand-*`)
que la Fase A prometía aplicar "al tocar cada página" y que la Fase B
sí aplicó a la tienda pública. Es un ajuste puntual, no una nueva fase
del ciclo de rediseño.

## Contexto

Una búsqueda del patrón de tarjeta ya usado en todo el proyecto
(`rounded-lg border border-brand-rosa-claro bg-white`) encontró 13
ubicaciones que lo usan sin ninguna sombra — 11 en admin/POS, 2 en la
tienda pública (checkout y detalle de pedido del cliente) que quedaron
con el mismo hueco por no haber sido tocadas en las Fases B1/B2/B3
(esas fases se enfocaron en home/categoría/producto, no en
checkout/cuenta). El usuario confirmó incluir también esas 2.

El POS (`pos-terminal.tsx`) no tiene ninguna tarjeta hoy — sus dos
columnas ("Buscar producto", "Venta actual") son `<div>` sueltos sin
borde ni fondo. El usuario confirmó envolverlas en el mismo estilo de
tarjeta.

## Alcance

1. Las 13 ubicaciones con tarjeta existente ganan `shadow-brand-sm`;
   las que además son un `<Link>` clickeable ganan
   `hover:shadow-brand-md` (reemplazando o complementando cualquier
   `hover:border-brand-rosa` que ya tengan).
2. Las dos columnas del POS se envuelven en `<div>` con el mismo
   patrón de tarjeta (`rounded-lg border border-brand-rosa-claro
   bg-white p-4 shadow-brand-sm`) que el resto del admin, sin cambiar
   el contenido ni la lógica interna de cada columna.

Ubicaciones con tarjeta existente (13):

```
src/app/admin/page.tsx                          (4 tarjetas)
src/app/admin/informes/page.tsx
src/app/admin/informes/ventas/page.tsx
src/app/admin/informes/metodos-pago/page.tsx
src/app/admin/informes/gastos/page.tsx
src/app/admin/informes/ganancia/page.tsx
src/app/admin/informes/compras/page.tsx
src/app/admin/gastos/page.tsx
src/app/admin/compras/compra-form.tsx
src/app/admin/pedidos/[id]/page.tsx
src/app/pos/venta/[id]/page.tsx
src/app/(store)/cuenta/pedidos/[id]/page.tsx
src/app/(store)/checkout/page.tsx
```

Fuera de alcance: cambios de tipografía (el admin sigue sin usar
`font-display`/Cinzel, reservado para la tienda pública), cambios de
paleta, cambios de layout/estructura más allá de envolver el POS en
tarjetas, cualquier lógica o dato.

## Arquitectura

Cambio de clases Tailwind puntual, sin componentes nuevos — mismo
patrón mecánico ya usado en la Fase C. Cada tarjeta existente gana
`shadow-brand-sm` (y `hover:shadow-brand-md` si es un `<Link>`) sin
tocar el resto de su `className` ni su contenido. El POS gana dos
`<div>` contenedores nuevos envolviendo el contenido ya existente de
cada columna, sin cambiar ninguna lógica de `pos-terminal.tsx`.

## Testing

- Sin lógica nueva — solo clases CSS sobre JSX existente, mismo
  criterio sin tests dedicados que la Fase C.
- Verificación: `pnpm build && pnpm lint && pnpm test` en verde.
- Revisión manual: confirmar visualmente que las tarjetas del admin,
  los informes, el checkout y el POS se ven con sombra de marca y
  coherentes entre sí.

## UI

Mismos tokens ya establecidos (`shadow-brand-sm`, `shadow-brand-md`,
de la Fase A) — sin paleta, tipografía ni componentes nuevos.
