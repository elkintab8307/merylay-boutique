# Rediseño — Fase C: Responsividad funcional en Admin y POS

## Objetivo

Corregir los tres problemas de responsividad ya identificados desde la
Fase A (`docs/superpowers/specs/2026-08-10-diseno-fase-a-fundacion-design.md`,
sección "Fuera de alcance") en el panel admin y el POS: tablas que se
desbordan en móvil, dos formularios con grid de columnas fijo, y
botones táctiles pequeños en el POS. Es la última fase del ciclo de
rediseño (A → B1/B2/B3 → C), puramente funcional/responsiva — sin
cambios de comportamiento, datos ni contenido visual nuevo.

## Alcance

1. **Scroll horizontal en tablas de admin**: las 16 páginas del panel
   que usan `<table className="w-full border-collapse text-sm">` sin
   ningún contenedor con scroll se envuelven en
   `<div className="overflow-x-auto">`, para que en pantallas angostas
   la tabla se pueda desplazar horizontalmente en vez de desbordar el
   viewport y romper el layout.
2. **Grid responsivo en `compra-form.tsx`**: la fila de cada ítem de
   compra (`grid-cols-[2fr_1.5fr_1fr_1fr_auto]`, fija) gana un
   breakpoint para apilarse en una sola columna en móvil.
3. **Grid responsivo en variantes de `producto-form.tsx`**: la fila de
   cada variante (`grid-cols-4`, fija) gana un breakpoint para
   mostrarse en 2 columnas en móvil en vez de 4 apretadas.
4. **Botones táctiles en el POS**: los botones "+"/"-" de cantidad en
   `pos-terminal.tsx` (`h-7 w-7`, 28px) suben a `h-11 w-11` (44px),
   tamaño mínimo recomendado para objetivos táctiles.

Fuera de alcance: cualquier cambio visual de marca/contenido (eso ya
se hizo en las Fases A/B); rediseño de la estructura de estas páginas
más allá de hacerlas usables en móvil; cambios de lógica, validación o
datos en ninguno de los formularios/páginas tocados.

## Arquitectura

### Tablas de admin

Las 16 páginas afectadas comparten exactamente el mismo patrón de
apertura de tabla (`<table className="w-full border-collapse text-sm">`),
verificado con una búsqueda en todo `src/app`:

```
src/app/admin/categorias/page.tsx
src/app/admin/productos/page.tsx
src/app/admin/pedidos/page.tsx
src/app/admin/gastos/page.tsx
src/app/admin/gastos/categorias/page.tsx
src/app/admin/compras/page.tsx
src/app/admin/compras/proveedores/page.tsx
src/app/admin/resenas/page.tsx
src/app/admin/informes/ventas/page.tsx
src/app/admin/informes/productos/page.tsx
src/app/admin/informes/gastos/page.tsx
src/app/admin/informes/ganancia/page.tsx
src/app/admin/informes/compras/page.tsx
src/app/admin/informes/metodos-pago/page.tsx
src/app/admin/informes/stock-bajo/page.tsx
src/app/superadmin/usuarios/page.tsx
```

Cambio idéntico y mecánico en las 16: envolver el elemento
`<table className="w-full border-collapse text-sm">...</table>`
completo (incluyendo `<thead>`/`<tbody>`) en
`<div className="overflow-x-auto">...</div>`, sin tocar ninguna otra
parte del archivo (encabezados, botones, lógica de datos).

### `compra-form.tsx`

La única línea que cambia es la clase del contenedor de cada fila de
ítem (dentro del `.map` de `fields`):

```
grid-cols-[2fr_1.5fr_1fr_1fr_auto]
```

pasa a:

```
grid-cols-1 sm:grid-cols-[2fr_1.5fr_1fr_1fr_auto]
```

### Variantes en `producto-form.tsx`

La única línea que cambia es la clase del contenedor de cada fila de
variante:

```
grid-cols-4
```

pasa a:

```
grid-cols-2 sm:grid-cols-4
```

### POS — botones de cantidad

En `pos-terminal.tsx`, los dos botones "-"/"+" dentro de la lista de
ítems de la venta actual cambian de `h-7 w-7` a `h-11 w-11`. No se
tocan los `<select>` de talla/color ni el botón "Agregar" de
`product-search-result.tsx` (ya usa el componente `Button` compartido,
que desde la Fase A tiene `size="default"` en `h-10`, un tamaño
razonable para ese contexto).

## Testing

- Sin lógica de negocio nueva — cambios puramente de clases CSS/Tailwind
  en JSX ya existente, sin tests dedicados (mismo criterio que cambios
  visuales similares en fases anteriores).
- Verificación: `pnpm build && pnpm lint && pnpm test` en verde.
- Revisión manual: achicar la ventana del navegador (o usar las
  herramientas de dispositivo móvil) en al menos una tabla de admin,
  en `compra-form`, en las variantes de `producto-form`, y en el POS,
  para confirmar que ya no hay desbordamiento horizontal y que los
  botones de cantidad son más fáciles de tocar.

## UI

Sin cambios de paleta, tipografía ni contenido — esta fase es
exclusivamente de responsividad funcional.
