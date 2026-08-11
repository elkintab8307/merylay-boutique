# Rediseño — Fase A: Fundación

## Objetivo

Sentar la base visual y técnica para que el resto del sitio (tienda
pública en la Fase B, admin/POS en la Fase C) se vea profesional,
coherente con la guía de marca real, y funcione bien en dispositivos
móviles — sin todavía rediseñar el contenido de páginas específicas.

## Contexto: guía de marca real

Se revisó `MeryLay_Guia_de_Marca.pdf` y el logo final
(`LOGO FINAL.png`, en `d:\TRABAJOS\MARY\pijamas\logo\`). Hallazgos:

- **Paleta de color**: coincide exactamente con lo ya implementado en
  `globals.css` (`#E96A9E`, `#D9A441`, `#F29DB8`, `#F5B7C8`, `#F8D4DD`,
  `#FFF8F4`, texto `#6E2A44`). Sin cambios de color.
- **Tipografía**: la guía sugiere Cinzel + Cormorant Garamond para texto
  (pensada para impresión/redes). El código ya usa Montserrat para
  UI/cuerpo por legibilidad real en pantallas chicas — se mantiene esa
  decisión técnica (ya está en `CLAUDE.md`) y se agrega Cinzel
  únicamente para títulos grandes, como la propia guía técnica ya
  contemplaba como opción.
- **Logo**: el proyecto tenía un placeholder genérico
  (`isotipo-placeholder.svg`, 295 bytes) en vez del logo real. **Ya
  corregido** (ver "Trabajo ya realizado" abajo).
- **Isotipos sueltos** (mariposa, corona, monograma ML, etc.): solo existe
  una lámina compuesta de referencia, no archivos individuales
  exportados. Quedan fuera de alcance hasta que existan esos archivos.

## Trabajo ya realizado (verificado en vivo antes de este documento)

- `LOGO FINAL.png` procesado con `sharp` (ya confirmado que genera PNG
  válido, sin artefactos) en tres tamaños: `public/brand/logo-principal.png`
  (800×800, header/footer), `src/app/icon.png` (512×512, favicon vía
  convención de Next App Router — reemplaza `icon.svg`), y
  `public/brand/apple-touch-icon.png` (180×180).
- `sharp` agregado como dependencia real (además de generar estos
  assets, es la librería que Vercel/Next recomiendan tener instalada
  para la optimización de imágenes en producción).
- Componente `Sheet` de shadcn/ui instalado (`src/components/ui/sheet.tsx`)
  — es la base del menú móvil de esta fase.

## Alcance

1. **Bug de layout**: `SiteHeader` (carrito, login, categorías) vive en
   el layout raíz y se filtra a `/admin`, `/pos` y `/superadmin` — un
   miembro del staff ve el header de cliente sobre su propio panel. Se
   mueve a un layout propio de la tienda pública (`(store)/layout.tsx`),
   que además es donde van los pixeles de seguimiento (punto 5).
2. **Tipografía**: cargar Cinzel, exponerla como utilidad `font-display`.
   No se aplica a ninguna página en esta fase — queda lista para la
   Fase B.
3. **Sistema de profundidad**: tokens de sombra con tinte ciruela de
   marca (`shadow-brand-sm/md/lg`), aplicados a `Button` (con aumento de
   altura para objetivo táctil) e `Input`. El componente `Card` de
   shadcn existe pero no se usa en ningún lado del proyecto (todo
   "tarjeta" es un `<div>` a mano) — queda intacto; la Fase B/C aplicará
   los nuevos tokens de sombra directamente a esos divs al tocar cada
   página, no se migra a `Card` en esta fase.
4. **Navegación móvil**: un componente compartido (`MobileNavSheet`,
   sobre `Sheet` de shadcn) que colapsa a menú hamburguesa por debajo de
   `md:`, usado en `SiteHeader` (categorías), `AdminNav` y
   `SuperadminNav` (enlaces de sección) — hoy los tres son filas fijas
   que se desbordan en pantallas angostas.
5. **Pixeles de seguimiento**: Meta Pixel y TikTok Pixel, cada uno
   opcional vía variable de entorno (`NEXT_PUBLIC_META_PIXEL_ID`,
   `NEXT_PUBLIC_TIKTOK_PIXEL_ID`) — si no están configuradas, el
   componente no renderiza nada, sin romper build ni runtime (mismo
   criterio *fail-open* ya documentado para `RESEND_API_KEY`). Solo en
   el layout de la tienda pública, nunca en admin/POS/superadmin.

Fuera de alcance de esta fase (Fase C, ya acordada): tablas de admin sin
scroll horizontal, los 2 formularios con grid de columnas fijo
(`compra-form.tsx`, variantes de `producto-form.tsx`), tamaño de botones
táctiles en el POS. Fuera de alcance permanente: isotipos sueltos (sin
archivos fuente), modo oscuro (no solicitado), rediseño de contenido de
páginas específicas (Fase B/C).

## Arquitectura

### Layout de la tienda pública

`(store)` (catálogo, carrito, checkout, cuenta) y `(auth)` (login,
registro) son dos grupos de rutas hermanos — ambos públicos, ninguno
parte del panel admin. Un componente compartido
`src/components/layout/public-layout-shell.tsx` renderiza
`<TrackingPixels />` + `<SiteHeader />` + `children`; `src/app/(store)/layout.tsx`
y `src/app/(auth)/layout.tsx` (nuevo, no existía) son envoltorios de
tres líneas que lo usan cada uno. `src/app/layout.tsx` (raíz) deja de
importar/renderizar `SiteHeader` — solo mantiene fuentes y el `<body>`
base, que ahora heredan `/admin`, `/pos` y `/superadmin` sin el header
de cliente encima, y sin los pixeles de seguimiento (que tampoco tiene
sentido disparar sobre actividad del staff).

### Tipografía

`src/lib/fonts.ts` gana el export `cinzel` (`next/font/google`, pesos
400/600/700, variable `--font-cinzel`). `globals.css` gana
`--font-display: var(--font-cinzel);` dentro de `@theme inline`, lo que
expone automáticamente la utilidad `font-display` (mismo mecanismo por
el que `--font-heading` ya produce `font-heading`).

### Tokens de sombra

`globals.css` gana tres tokens dentro de `@theme inline`:

```css
--shadow-brand-sm: 0 1px 3px rgb(110 42 68 / 0.10), 0 1px 2px rgb(110 42 68 / 0.06);
--shadow-brand-md: 0 6px 16px rgb(110 42 68 / 0.12), 0 2px 6px rgb(110 42 68 / 0.08);
--shadow-brand-lg: 0 16px 32px rgb(110 42 68 / 0.14), 0 6px 12px rgb(110 42 68 / 0.10);
```

(`110 42 68` es el rgb de `#6e2a44`, ciruela — sombra con tinte de marca
en vez de gris genérico.) Tailwind v4 expone automáticamente
`shadow-brand-sm`/`shadow-brand-md`/`shadow-brand-lg` a partir de estos
tokens.

### `Button` / `Input`

Se editan directamente los dos componentes base (no se crea una nueva
variant "brand" — el variant `default` ya hereda `bg-primary` =
`brand-rosa` vía los tokens de shadcn ya configurados, así que mejorar
`default` mejora automáticamente todos los botones del sitio que usan
ese variant, incluidos los que hoy sobreescriben el color con
`className="bg-brand-rosa ..."` inline, sin tocar esos ~15+ archivos):

- `Button`: `size="default"` sube de `h-8` (32px) a `h-10` (40px);
  `size="lg"` sube de `h-9` a `h-11` (44px, para CTAs principales);
  `size="icon"` sube de `size-8` a `size-10`. Los variants `default` y
  `secondary` ganan `shadow-brand-sm` con `hover:shadow-brand-md`
  (variants ya pensados como "flat" — `outline`, `ghost`, `link` — no
  llevan sombra, mantienen su aspecto sutil).
- `Input`: sube de `h-8` a `h-10` para que sea consistente con el nuevo
  alto de `Button` y más cómodo de tocar en móvil.

### Navegación móvil

`src/components/layout/mobile-nav-sheet.tsx` (nuevo, client component):
recibe `links: { href: string; label: string }[]` y un `triggerLabel`,
renderiza un botón hamburguesa (ícono `Menu` de `lucide-react`, visible
solo `md:hidden`) que abre un `Sheet` lateral con los enlaces; cada
enlace envuelto en `SheetClose asChild` para que cerrar el menú al
navegar sea automático.

- `SiteHeader`: la fila de categorías (`<nav className="flex gap-4">`,
  la que hoy se desborda) se divide en `hidden md:flex` (fila actual,
  intacta en desktop) + `<MobileNavSheet>` con esos mismos enlaces,
  visible solo debajo de `md:`. El resto del header (logo, carrito,
  login) no cambia en esta fase.
- `AdminNav` / `SuperadminNav`: mismo patrón — la lista de enlaces ya
  existente se reutiliza tal cual, solo cambia cómo se presenta según
  el ancho de pantalla.

### Pixeles de seguimiento

`src/components/analytics/tracking-pixels.tsx` (nuevo, client
component): lee `process.env.NEXT_PUBLIC_META_PIXEL_ID` y
`process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID`; si cada uno existe, inyecta
su script oficial (snippet estándar publicado por Meta/TikTok) vía
`next/script` con `strategy="afterInteractive"`, incluyendo el evento
`PageView`/`page()` inicial. Si una variable falta, ese pixel
simplemente no se renderiza — sin error, sin romper nada (mismo criterio
*fail-open* que `RESEND_API_KEY`).

`.env.local.example` gana las dos líneas nuevas (vacías, opcionales).

## Testing

- Sin lógica de negocio pura nueva que amerite TDD (son componentes de
  presentación y configuración de fuentes/scripts).
- Verificación: `pnpm build && pnpm lint && pnpm test` deben quedar en
  verde. Revisión manual de que `/admin`, `/pos` y `/superadmin` ya no
  muestran el header de tienda, y de que el menú hamburguesa aparece y
  funciona por debajo de `md:` en los tres lugares (tienda, admin,
  superadmin) — con la limitación ya conocida de no tener herramienta de
  navegador en esta sesión, se deja como verificación manual pendiente
  del usuario, igual que en fases anteriores.

## UI

Paleta y tono sin cambios respecto a lo ya establecido — esta fase es
de infraestructura (tokens, componentes base, navegación, assets),
no contenido visual nuevo de página.
