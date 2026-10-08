# Informes PDF via HTML + Puppeteer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la generación de PDFs del bot de WhatsApp (dibujados a
mano con `pdf-lib` en Deno) por HTML/CSS real renderizado con Puppeteer +
Chromium en un nuevo endpoint de Next.js/Vercel, corrigiendo de paso el bug
de agrupación de productos que motivó el cambio.

**Architecture:** Un endpoint nuevo `POST /api/pdf/render` en el repo
Next.js (runtime Node.js, protegido por un secreto compartido) recibe
`{tipo, ...datos}`, construye HTML con una de dos plantillas puras, lo
renderiza a PDF con Puppeteer, y devuelve los bytes. La Edge Function de
Supabase reemplaza `pdf-marca.ts` por `pdf-render.ts`, que mantiene las
mismas firmas `generarPdfTabla`/`generarPdfTarjetas` pero por dentro hace
un `fetch()` a ese endpoint en vez de dibujar con `pdf-lib`. Ningún
call-site en `reports.ts`/`owner-actions.ts`/`catalog.ts` cambia.

**Tech Stack:** Next.js (App Router, runtime Node.js) + `puppeteer-core` +
`@sparticuz/chromium` (producción/Vercel) + `puppeteer` (desarrollo local,
Chromium completo multiplataforma) + Vitest. Lado Supabase: Deno + Vitest,
sin nuevas dependencias (se eliminan `pdf-lib`/`@pdf-lib/fontkit`).

**Spec:** `docs/superpowers/specs/2026-10-08-informes-pdf-html-puppeteer-design.md`

## Global Constraints

- `reports.ts`, `owner-actions.ts` y los call-sites de `generarPdfTarjetas`/`generarPdfTabla` en `catalog.ts` NO cambian sus llamadas — mismas firmas exactas que hoy.
- `PDF_RENDER_SECRET` es fail-closed en AMBOS lados: sin él configurado, ni la Edge Function manda la petición ni el endpoint de Vercel la acepta.
- El endpoint de Vercel corre en runtime Node.js (`export const runtime = "nodejs"`), nunca Edge — Puppeteer no corre ahí.
- Las plantillas (`plantillaTabla`/`plantillaTarjetas`) son funciones puras `(datos) => string`: sin `fetch`, sin leer `process.env`, sin logging. Todo valor derivado del entorno (ej. `logoUrl`) se les pasa como parámetro.
- Comentarios y textos de cara al usuario en español, siguiendo las convenciones ya establecidas en el repo (ver cualquier archivo existente de `supabase/functions/whatsapp-webhook/` como referencia de tono).

## Review Focus

- Secreto ausente o incorrecto en `POST /api/pdf/render` → debe rechazar con 403/500 ANTES de lanzar Chromium (costo de cómputo evitable), nunca "renderizar por si acaso".
- Nombre de producto muy largo en una tarjeta → debe truncarse visualmente (line-clamp), nunca desbordar sobre la tarjeta vecina (el bug visual original que motivó este plan).
- Mismo nombre de producto con `productId` distinto (tallas como productos separados, no variantes) → debe fusionarse en UNA tarjeta con todas sus tallas (el bug de agrupación real).
- Falta de `fotoUrl`/`fotoHeroUrl`/`logoUrl` → la plantilla debe omitir esa imagen o mostrar un placeholder, nunca romper el HTML generado ni lanzar una excepción.
- `tarjetas: []` o `filas: []` (reporte sin datos) → ambas plantillas deben renderizar igual (grilla/tabla vacía) sin lanzar; esto no debería ocurrir en la práctica (los llamadores ya devuelven un mensaje de texto antes de pedir un PDF vacío), pero la plantilla misma no debe asumirlo.

---

## Task 1: `plantillaTabla` (Next.js)

**Files:**
- Create: `src/lib/pdf/plantilla-tabla.ts`
- Test: `src/lib/pdf/plantilla-tabla.test.ts`

**Interfaces:**
- Produce: `export interface DatosTabla { titulo: string; encabezados: string[]; filas: string[][]; logoUrl: string | null; }` y `export function plantillaTabla(datos: DatosTabla): string`.
- Consume: nada de otras tareas.

- [ ] **Step 1: Escribe el test que falla**

Crea `src/lib/pdf/plantilla-tabla.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { plantillaTabla } from "./plantilla-tabla";

describe("plantillaTabla", () => {
  it("incluye el titulo, los encabezados y una fila por dato", () => {
    const html = plantillaTabla({
      titulo: "Informe de ventas",
      encabezados: ["Fecha", "Total"],
      filas: [["2026-10-01", "$40.000"], ["2026-10-02", "$55.000"]],
      logoUrl: null,
    });

    expect(html).toContain("Informe de ventas");
    expect(html).toContain("Fecha");
    expect(html).toContain("Total");
    expect(html).toContain("$40.000");
    expect(html).toContain("$55.000");
    expect(html).toContain("<!doctype html>");
  });

  it("escapa HTML en los valores para que un nombre con < o & no rompa el documento", () => {
    const html = plantillaTabla({
      titulo: "Informe",
      encabezados: ["Producto"],
      filas: [["Camiseta <Talla> & Co"]],
      logoUrl: null,
    });

    expect(html).toContain("Camiseta &lt;Talla&gt; &amp; Co");
    expect(html).not.toContain("<Talla>");
  });

  it("sin filas, renderiza la tabla vacia sin lanzar", () => {
    expect(() => plantillaTabla({ titulo: "Informe", encabezados: ["Fecha"], filas: [], logoUrl: null })).not.toThrow();
  });

  it("con logoUrl, incluye la imagen del logo", () => {
    const html = plantillaTabla({ titulo: "Informe", encabezados: [], filas: [], logoUrl: "https://x/logo.png" });
    expect(html).toContain("https://x/logo.png");
  });

  it("sin logoUrl, no incluye ninguna etiqueta img", () => {
    const html = plantillaTabla({ titulo: "Informe", encabezados: [], filas: [], logoUrl: null });
    expect(html).not.toContain("<img");
  });
});
```

- [ ] **Step 2: Corre el test y confirma que falla**

Run: `pnpm exec vitest run src/lib/pdf/plantilla-tabla.test.ts`
Expected: FAIL con "Cannot find module './plantilla-tabla'" (el archivo no existe todavía).

- [ ] **Step 3: Implementa `plantillaTabla`**

Crea `src/lib/pdf/plantilla-tabla.ts`:

```ts
// Plantilla HTML pura para los informes de tabla del bot de WhatsApp
// (ventas, gastos, clientes, creditos, abonos, productos sin fotos).
// Sin I/O ni acceso a variables de entorno: todo lo que depende del
// entorno (como logoUrl) se recibe ya resuelto desde el llamador.

const COLORES = {
  rosaFuerte: "#E96A9E",
  dorado: "#D9A441",
  rosaClaro: "#F8D4DD",
  crema: "#FFF8F4",
  ciruela: "#6E2A44",
};

export interface DatosTabla {
  titulo: string;
  encabezados: string[];
  filas: string[][];
  logoUrl: string | null;
}

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function plantillaTabla(datos: DatosTabla): string {
  const { titulo, encabezados, filas, logoUrl } = datos;

  const filasHtml = filas
    .map(
      (fila, i) => `
    <tr class="${i % 2 === 1 ? "fila-alterna" : ""}">
      ${fila.map((valor) => `<td>${escaparHtml(valor)}</td>`).join("")}
    </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Montserrat', sans-serif; background: ${COLORES.crema}; color: ${COLORES.ciruela}; width: 1040px; }
  .encabezado { display: flex; align-items: center; gap: 16px; padding: 24px 32px; background: ${COLORES.rosaClaro}; border-bottom: 3px solid ${COLORES.dorado}; }
  .logo { height: 50px; }
  h1 { font-family: 'Playfair Display', serif; font-size: 24px; color: ${COLORES.rosaFuerte}; }
  table { width: 100%; border-collapse: collapse; }
  th { background: ${COLORES.rosaFuerte}; color: white; text-align: left; padding: 10px 16px; font-size: 13px; font-weight: 600; }
  td { padding: 8px 16px; font-size: 12px; border-bottom: 1px solid ${COLORES.rosaClaro}; }
  .fila-alterna { background: ${COLORES.rosaClaro}; }
  footer { text-align: center; padding: 16px; font-size: 10px; color: ${COLORES.ciruela}; }
</style>
</head>
<body>
  <div class="encabezado">
    ${logoUrl ? `<img src="${escaparHtml(logoUrl)}" class="logo" />` : ""}
    <h1>${escaparHtml(titulo)}</h1>
  </div>
  <table>
    <thead><tr>${encabezados.map((e) => `<th>${escaparHtml(e)}</th>`).join("")}</tr></thead>
    <tbody>${filasHtml}</tbody>
  </table>
  <footer>MeryLay Boutique — Inspiración Femenina</footer>
</body>
</html>`;
}
```

- [ ] **Step 4: Corre el test y confirma que pasa**

Run: `pnpm exec vitest run src/lib/pdf/plantilla-tabla.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/plantilla-tabla.ts src/lib/pdf/plantilla-tabla.test.ts
git commit -m "feat: agrega plantillaTabla (HTML puro) para informes de tabla del bot"
```

---

## Task 2: `plantillaTarjetas` (Next.js)

**Files:**
- Create: `src/lib/pdf/plantilla-tarjetas.ts`
- Test: `src/lib/pdf/plantilla-tarjetas.test.ts`

**Interfaces:**
- Consume: `escaparHtml` de `./plantilla-tabla` (Task 1, ya mergeada).
- Produce: `export interface DatosTarjetas { titulo: string; subtitulo: string; fotoHeroUrl: string | null; estadisticas: { valor: string; etiqueta: string }[]; tarjetas: { fotoUrl: string | null; nombre: string; pills: { etiqueta: string; valores: string[] }[]; precio: number | null; nota?: string }[]; logoUrl: string | null; }` y `export function plantillaTarjetas(datos: DatosTarjetas): string`.

- [ ] **Step 1: Escribe el test que falla**

Crea `src/lib/pdf/plantilla-tarjetas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { plantillaTarjetas } from "./plantilla-tarjetas";

const DATOS_BASE = {
  titulo: "INFORME DE PRODUCTOS",
  subtitulo: "CATÁLOGO MERYLAY BOUTIQUE",
  fotoHeroUrl: null,
  logoUrl: null,
  estadisticas: [{ valor: "2", etiqueta: "PRODUCTOS" }],
};

describe("plantillaTarjetas", () => {
  it("incluye el titulo, subtitulo, estadisticas y una tarjeta por producto", () => {
    const html = plantillaTarjetas({
      ...DATOS_BASE,
      tarjetas: [
        { fotoUrl: "https://x/a.jpg", nombre: "Camiseta Mariposa", pills: [{ etiqueta: "Tallas", valores: ["S", "M", "L", "XL"] }], precio: 40000, nota: "stock: 12" },
        { fotoUrl: null, nombre: "Camiseta Sin Foto", pills: [], precio: null, nota: "stock: 2" },
      ],
    });

    expect(html).toContain("INFORME DE PRODUCTOS");
    expect(html).toContain("CATÁLOGO MERYLAY BOUTIQUE");
    expect(html).toContain("PRODUCTOS");
    expect(html).toContain("Camiseta Mariposa");
    expect(html).toContain("Camiseta Sin Foto");
    expect(html).toContain("$40.000");
    expect(html).toContain("https://x/a.jpg");
    expect((html.match(/class="tarjeta"/g) ?? []).length).toBe(2);
  });

  it("sin fotoUrl en una tarjeta, muestra un placeholder 'Sin foto' en vez de una img", () => {
    const html = plantillaTarjetas({
      ...DATOS_BASE,
      tarjetas: [{ fotoUrl: null, nombre: "Producto X", pills: [], precio: 1000 }],
    });

    expect(html).toContain("Sin foto");
  });

  it("escapa el nombre del producto (nunca rompe el HTML con < o &)", () => {
    const html = plantillaTarjetas({
      ...DATOS_BASE,
      tarjetas: [{ fotoUrl: null, nombre: "Camiseta <Edición> & Co", pills: [], precio: 1000 }],
    });

    expect(html).toContain("Camiseta &lt;Edición&gt; &amp; Co");
    expect(html).not.toContain("<Edición>");
  });

  it("cada grupo de pills dibuja un span por valor", () => {
    const html = plantillaTarjetas({
      ...DATOS_BASE,
      tarjetas: [{ fotoUrl: null, nombre: "Producto X", pills: [{ etiqueta: "Tallas", valores: ["S", "M", "L"] }], precio: null }],
    });

    expect((html.match(/class="pill"/g) ?? []).length).toBe(3);
  });

  it("precio null sin nota, no revienta y no muestra un precio", () => {
    const html = plantillaTarjetas({ ...DATOS_BASE, tarjetas: [{ fotoUrl: null, nombre: "Producto X", pills: [], precio: null }] });
    expect(html).not.toContain("class=\"precio\"");
  });

  it("sin tarjetas, renderiza la cuadricula vacia sin lanzar", () => {
    expect(() => plantillaTarjetas({ ...DATOS_BASE, tarjetas: [] })).not.toThrow();
  });

  it("con fotoHeroUrl y logoUrl, los incluye en el encabezado", () => {
    const html = plantillaTarjetas({ ...DATOS_BASE, fotoHeroUrl: "https://x/hero.jpg", logoUrl: "https://x/logo.png", tarjetas: [] });
    expect(html).toContain("https://x/hero.jpg");
    expect(html).toContain("https://x/logo.png");
  });
});
```

- [ ] **Step 2: Corre el test y confirma que falla**

Run: `pnpm exec vitest run src/lib/pdf/plantilla-tarjetas.test.ts`
Expected: FAIL con "Cannot find module './plantilla-tarjetas'".

- [ ] **Step 3: Implementa `plantillaTarjetas`**

Crea `src/lib/pdf/plantilla-tarjetas.ts`:

```ts
// Plantilla HTML pura para los informes con fotos del bot de WhatsApp
// (informe de productos del dueño, catalogo de clientes, cotizacion).
// Sin I/O ni acceso a variables de entorno -- ver nota en plantilla-tabla.ts.
import { escaparHtml } from "./plantilla-tabla";

export interface PillGrupo {
  etiqueta: string;
  valores: string[];
}

export interface Tarjeta {
  fotoUrl: string | null;
  nombre: string;
  pills: PillGrupo[];
  precio: number | null;
  nota?: string;
}

export interface Estadistica {
  valor: string;
  etiqueta: string;
}

export interface DatosTarjetas {
  titulo: string;
  subtitulo: string;
  fotoHeroUrl: string | null;
  estadisticas: Estadistica[];
  tarjetas: Tarjeta[];
  logoUrl: string | null;
}

function formatoMoneda(valor: number): string {
  return `$${valor.toLocaleString("es-CO")}`;
}

function pillsHtml(pills: PillGrupo[]): string {
  return pills
    .map(
      (grupo) => `
      <div class="fila-pill">
        <span class="etiqueta-pill">${escaparHtml(grupo.etiqueta)}:</span>
        ${grupo.valores.map((v) => `<span class="pill">${escaparHtml(v)}</span>`).join("")}
      </div>`,
    )
    .join("");
}

function tarjetaHtml(t: Tarjeta): string {
  const foto = t.fotoUrl
    ? `<img src="${escaparHtml(t.fotoUrl)}" class="foto-tarjeta" />`
    : `<div class="foto-tarjeta sin-foto">Sin foto</div>`;

  const precioHtml = t.precio !== null ? `<span class="precio">${formatoMoneda(t.precio)}</span>` : "";
  const notaHtml = t.nota ? `<span class="nota">${escaparHtml(t.nota)}</span>` : "";

  return `
    <div class="tarjeta">
      ${foto}
      <div class="info-tarjeta">
        <h3 class="nombre-producto">${escaparHtml(t.nombre)}</h3>
        ${pillsHtml(t.pills)}
        <div class="linea-precio">${precioHtml}${notaHtml}</div>
      </div>
    </div>`;
}

export function plantillaTarjetas(datos: DatosTarjetas): string {
  const { titulo, subtitulo, fotoHeroUrl, estadisticas, tarjetas, logoUrl } = datos;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --rosa-fuerte: #E96A9E;
    --dorado: #D9A441;
    --rosa-claro: #F8D4DD;
    --crema: #FFF8F4;
    --ciruela: #6E2A44;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Montserrat', sans-serif; background: var(--crema); color: var(--ciruela); width: 1040px; }
  .encabezado { display: flex; align-items: center; justify-content: space-between; background: var(--rosa-claro); border-bottom: 3px solid var(--dorado); padding: 24px 32px; min-height: 150px; }
  .marca { display: flex; align-items: center; gap: 16px; }
  .logo { height: 50px; }
  .titulos h1 { font-family: 'Playfair Display', serif; font-size: 28px; color: var(--rosa-fuerte); }
  .titulos h2 { font-size: 13px; letter-spacing: 1px; text-transform: uppercase; margin-top: 4px; }
  .foto-hero { width: 180px; height: 150px; object-fit: cover; border-left: 3px solid var(--dorado); }
  .stats { display: flex; background: white; }
  .stat { flex: 1; text-align: center; padding: 14px 0; border-right: 1px solid var(--dorado); }
  .stat:last-child { border-right: none; }
  .stat .valor { font-family: 'Playfair Display', serif; font-size: 20px; color: var(--rosa-fuerte); font-weight: 700; }
  .stat .etiqueta { font-size: 9px; letter-spacing: 1px; text-transform: uppercase; margin-top: 2px; }
  .cuadricula { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; padding: 24px; }
  .tarjeta { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(110, 42, 68, 0.15); display: flex; flex-direction: column; }
  .foto-tarjeta { width: 100%; height: 150px; object-fit: cover; display: block; }
  .foto-tarjeta.sin-foto { background: var(--rosa-claro); display: flex; align-items: center; justify-content: center; font-size: 11px; color: var(--ciruela); }
  .info-tarjeta { padding: 12px 14px; }
  .nombre-producto { font-size: 13px; font-weight: 700; color: var(--ciruela); margin-bottom: 8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .fila-pill { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-bottom: 6px; font-size: 10px; }
  .etiqueta-pill { font-weight: 700; margin-right: 2px; }
  .pill { background: var(--rosa-claro); border-radius: 999px; padding: 2px 8px; font-size: 9px; }
  .linea-precio { margin-top: 6px; font-size: 12px; }
  .precio { font-weight: 700; color: var(--dorado); }
  .nota { font-size: 9px; color: var(--ciruela); margin-left: 6px; }
  footer { text-align: center; padding: 16px; font-size: 10px; color: var(--ciruela); }
</style>
</head>
<body>
  <div class="encabezado">
    <div class="marca">
      ${logoUrl ? `<img src="${escaparHtml(logoUrl)}" class="logo" />` : ""}
      <div class="titulos">
        <h1>${escaparHtml(titulo)}</h1>
        <h2>${escaparHtml(subtitulo)}</h2>
      </div>
    </div>
    ${fotoHeroUrl ? `<img src="${escaparHtml(fotoHeroUrl)}" class="foto-hero" />` : ""}
  </div>
  <div class="stats">
    ${estadisticas.map((s) => `<div class="stat"><div class="valor">${escaparHtml(s.valor)}</div><div class="etiqueta">${escaparHtml(s.etiqueta)}</div></div>`).join("")}
  </div>
  <div class="cuadricula">
    ${tarjetas.map(tarjetaHtml).join("")}
  </div>
  <footer>MeryLay Boutique — Inspiración Femenina</footer>
</body>
</html>`;
}
```

- [ ] **Step 4: Corre el test y confirma que pasa**

Run: `pnpm exec vitest run src/lib/pdf/plantilla-tarjetas.test.ts`
Expected: PASS (7/7).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/plantilla-tarjetas.ts src/lib/pdf/plantilla-tarjetas.test.ts
git commit -m "feat: agrega plantillaTarjetas (HTML puro) para informes con fotos del bot"
```

---

## Task 3: Endpoint `POST /api/pdf/render` (Next.js + Puppeteer)

**Files:**
- Create: `src/app/api/pdf/render/route.ts`
- Test: `src/app/api/pdf/render/route.test.ts`
- Modify: `package.json` (agrega dependencias)
- Modify: `.env.local.example` (agrega `PDF_RENDER_SECRET`)

**Interfaces:**
- Consume: `plantillaTabla`/`DatosTabla` de `@/lib/pdf/plantilla-tabla` (Task 1), `plantillaTarjetas`/`DatosTarjetas` de `@/lib/pdf/plantilla-tarjetas` (Task 2).
- Produce: endpoint HTTP consumido por la Edge Function en la Task 4 — contrato exacto en el spec, sección "Contrato del endpoint".

- [ ] **Step 1: Agrega las dependencias**

Edita `package.json`, agrega a `dependencies`:

```json
    "puppeteer-core": "^24.0.0",
    "@sparticuz/chromium": "^131.0.1",
```

Agrega a `devDependencies`:

```json
    "puppeteer": "^24.0.0",
```

Run: `pnpm install`
Expected: instala sin errores (puede tardar por el binario de Chromium de `puppeteer`, es normal).

- [ ] **Step 2: Agrega la variable de entorno de ejemplo**

Edita `.env.local.example`, agrega después de `SITE_URL=`:

```env
PDF_RENDER_SECRET=
```

- [ ] **Step 3: Escribe el test que falla**

Crea `src/app/api/pdf/render/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function peticion(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://merylay.shop/api/pdf/render", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("POST /api/pdf/render", () => {
  it("sin PDF_RENDER_SECRET configurado, rechaza con 500 sin intentar renderizar", async () => {
    vi.stubEnv("PDF_RENDER_SECRET", "");
    const { POST } = await import("./route");

    const respuesta = await POST(peticion({ tipo: "tabla", titulo: "x", encabezados: [], filas: [] }));

    expect(respuesta.status).toBe(500);
  });

  it("con un secreto incorrecto, rechaza con 403", async () => {
    vi.stubEnv("PDF_RENDER_SECRET", "secreto-real");
    const { POST } = await import("./route");

    const respuesta = await POST(peticion({ tipo: "tabla", titulo: "x", encabezados: [], filas: [] }, { "x-pdf-render-secret": "incorrecto" }));

    expect(respuesta.status).toBe(403);
  });

  it("con tipo desconocido, rechaza con 400 sin intentar renderizar", async () => {
    vi.stubEnv("PDF_RENDER_SECRET", "secreto-real");
    const { POST } = await import("./route");

    const respuesta = await POST(peticion({ tipo: "otra-cosa" }, { "x-pdf-render-secret": "secreto-real" }));

    expect(respuesta.status).toBe(400);
  });

  it("con tipo 'tabla' y secreto correcto, renderiza y devuelve el PDF", async () => {
    vi.stubEnv("PDF_RENDER_SECRET", "secreto-real");
    const paginaMock = { setContent: vi.fn(async () => {}), pdf: vi.fn(async () => new Uint8Array([1, 2, 3])) };
    const navegadorMock = { newPage: vi.fn(async () => paginaMock), close: vi.fn(async () => {}) };
    vi.doMock("puppeteer", () => ({ default: { launch: vi.fn(async () => navegadorMock) } }));
    const { POST } = await import("./route");

    const respuesta = await POST(peticion({ tipo: "tabla", titulo: "Informe", encabezados: ["A"], filas: [["1"]] }, { "x-pdf-render-secret": "secreto-real" }));

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("Content-Type")).toBe("application/pdf");
    expect(paginaMock.setContent).toHaveBeenCalledWith(expect.stringContaining("Informe"), expect.anything());
    expect(navegadorMock.close).toHaveBeenCalled();
  });

  it("con tipo 'tarjetas', renderiza usando plantillaTarjetas", async () => {
    vi.stubEnv("PDF_RENDER_SECRET", "secreto-real");
    const paginaMock = { setContent: vi.fn(async () => {}), pdf: vi.fn(async () => new Uint8Array([1])) };
    const navegadorMock = { newPage: vi.fn(async () => paginaMock), close: vi.fn(async () => {}) };
    vi.doMock("puppeteer", () => ({ default: { launch: vi.fn(async () => navegadorMock) } }));
    const { POST } = await import("./route");

    const respuesta = await POST(
      peticion({ tipo: "tarjetas", titulo: "INFORME", subtitulo: "SUB", fotoHeroUrl: null, estadisticas: [], tarjetas: [] }, { "x-pdf-render-secret": "secreto-real" }),
    );

    expect(respuesta.status).toBe(200);
    expect(paginaMock.setContent).toHaveBeenCalledWith(expect.stringContaining("INFORME"), expect.anything());
  });

  it("si Puppeteer lanza, devuelve 500 y cierra el navegador si llego a abrirse", async () => {
    vi.stubEnv("PDF_RENDER_SECRET", "secreto-real");
    const navegadorMock = { newPage: vi.fn(async () => { throw new Error("fallo de renderizado"); }), close: vi.fn(async () => {}) };
    vi.doMock("puppeteer", () => ({ default: { launch: vi.fn(async () => navegadorMock) } }));
    const { POST } = await import("./route");

    const respuesta = await POST(peticion({ tipo: "tabla", titulo: "x", encabezados: [], filas: [] }, { "x-pdf-render-secret": "secreto-real" }));

    expect(respuesta.status).toBe(500);
    expect(navegadorMock.close).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Corre el test y confirma que falla**

Run: `pnpm exec vitest run src/app/api/pdf/render/route.test.ts`
Expected: FAIL con "Cannot find module './route'".

- [ ] **Step 5: Implementa el endpoint**

Crea `src/app/api/pdf/render/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { plantillaTabla, type DatosTabla } from "@/lib/pdf/plantilla-tabla";
import { plantillaTarjetas, type DatosTarjetas } from "@/lib/pdf/plantilla-tarjetas";

export const runtime = "nodejs";
export const maxDuration = 60;

type CuerpoTabla = { tipo: "tabla" } & Omit<DatosTabla, "logoUrl">;
type CuerpoTarjetas = { tipo: "tarjetas" } & Omit<DatosTarjetas, "logoUrl">;

// Forma minima que necesitamos de un navegador/pagina de Puppeteer -- se usa
// un cast a esta interfaz en vez de importar los tipos reales porque en
// desarrollo local se usa el paquete `puppeteer` (Chromium completo,
// multiplataforma) y en Vercel `puppeteer-core` + `@sparticuz/chromium`
// (binario minimo para Amazon Linux/Lambda, no corre en Windows/Mac de
// desarrollo); ambos satisfacen esta forma en tiempo de ejecucion.
interface PaginaMinima {
  setContent(html: string, opts: { waitUntil: string }): Promise<void>;
  pdf(opts: { printBackground: boolean; width: string }): Promise<Uint8Array>;
}
interface NavegadorMinimo {
  newPage(): Promise<PaginaMinima>;
  close(): Promise<void>;
}

async function lanzarNavegador(): Promise<NavegadorMinimo> {
  if (process.env.VERCEL) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = await import("puppeteer-core");
    return (await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    })) as unknown as NavegadorMinimo;
  }
  // Desarrollo local: `puppeteer` (no `puppeteer-core`) instala su propio
  // Chromium multiplataforma -- el binario de @sparticuz/chromium es
  // especifico de Amazon Linux y no corre en un equipo de desarrollo.
  const puppeteer = (await import("puppeteer")).default;
  return (await puppeteer.launch({ headless: true })) as unknown as NavegadorMinimo;
}

async function renderizarHtmlAPdf(html: string): Promise<Uint8Array> {
  const navegador = await lanzarNavegador();
  try {
    const pagina = await navegador.newPage();
    await pagina.setContent(html, { waitUntil: "networkidle0" });
    return pagina.pdf({ printBackground: true, width: "1040px" });
  } finally {
    await navegador.close();
  }
}

export async function POST(request: NextRequest) {
  // Fail-closed: mismo patron que WOMPI_EVENTS_SECRET/NOTIFICAR_PEDIDO_SECRET
  // ya usados en este repo -- sin este secreto, cualquiera podria forzar
  // renders de Chromium (costo de computo) golpeando la URL publica.
  const secretoEsperado = process.env.PDF_RENDER_SECRET;
  if (!secretoEsperado) {
    console.error("[api/pdf/render] PDF_RENDER_SECRET no esta configurado -- rechazando toda peticion.");
    return NextResponse.json({ error: "Configuracion del servidor invalida." }, { status: 500 });
  }
  const secretoRecibido = request.headers.get("x-pdf-render-secret");
  if (secretoRecibido !== secretoEsperado) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido." }, { status: 400 });
  }

  const tipo = (cuerpo as { tipo?: unknown } | null)?.tipo;
  const logoUrl = process.env.SITE_URL ? `${process.env.SITE_URL}/brand/logo-principal.png` : null;

  let html: string;
  if (tipo === "tabla") {
    const datos = cuerpo as CuerpoTabla;
    html = plantillaTabla({ titulo: datos.titulo, encabezados: datos.encabezados, filas: datos.filas, logoUrl });
  } else if (tipo === "tarjetas") {
    const datos = cuerpo as CuerpoTarjetas;
    html = plantillaTarjetas({
      titulo: datos.titulo,
      subtitulo: datos.subtitulo,
      fotoHeroUrl: datos.fotoHeroUrl,
      estadisticas: datos.estadisticas,
      tarjetas: datos.tarjetas,
      logoUrl,
    });
  } else {
    return NextResponse.json({ error: `tipo desconocido: ${String(tipo)}` }, { status: 400 });
  }

  try {
    const pdfBytes = await renderizarHtmlAPdf(html);
    return new NextResponse(Buffer.from(pdfBytes), { status: 200, headers: { "Content-Type": "application/pdf" } });
  } catch (error) {
    console.error("[api/pdf/render] Error renderizando el PDF:", error);
    return NextResponse.json({ error: "No se pudo generar el PDF." }, { status: 500 });
  }
}
```

- [ ] **Step 6: Corre el test y confirma que pasa**

Run: `pnpm exec vitest run src/app/api/pdf/render/route.test.ts`
Expected: PASS (6/6). Nota: el test de "Puppeteer lanza" espera que `close()` se haya llamado incluso si `newPage()` falla — si falla por `navegador` ser `undefined` en ese punto, revisa que `lanzarNavegador()` ya devolvió el mock ANTES de que `newPage()` lance (el mock lanza dentro de `newPage`, no de `launch`), asi que el `try/finally` si alcanza a tener `navegador` definido.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml .env.local.example src/app/api/pdf/render/route.ts src/app/api/pdf/render/route.test.ts
git commit -m "feat: agrega el endpoint POST /api/pdf/render (Puppeteer + Chromium)"
```

---

## Task 4: `pdf-render.ts` (Supabase Edge Function)

**Files:**
- Create: `supabase/functions/whatsapp-webhook/pdf-render.ts`
- Create: `supabase/functions/whatsapp-webhook/pdf-render.test.ts`
- Delete: `supabase/functions/whatsapp-webhook/pdf-marca.ts`
- Delete: `supabase/functions/whatsapp-webhook/pdf-marca.test.ts`

**Interfaces:**
- Produce: `export interface EstadisticaTarjetas { valor: string; etiqueta: string }`, `export interface TarjetaProducto { fotoUrl: string | null; nombre: string; pills: { etiqueta: string; valores: string[] }[]; precio: number | null; nota?: string }`, `export async function generarPdfTabla(titulo: string, encabezados: string[], filas: string[][]): Promise<Uint8Array>`, `export async function generarPdfTarjetas(titulo: string, subtitulo: string, fotoHeroUrl: string | null, estadisticas: EstadisticaTarjetas[], tarjetas: TarjetaProducto[]): Promise<Uint8Array>` — MISMAS firmas que las que hoy exporta `pdf-marca.ts` (ver Task 5/6, que solo cambian el import path).

- [ ] **Step 1: Escribe el test que falla**

Crea `supabase/functions/whatsapp-webhook/pdf-render.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

function stubEnv(valores: Record<string, string | undefined>) {
  vi.stubGlobal("Deno", { env: { get: (k: string) => valores[k] } });
}

describe("generarPdfTabla", () => {
  it("sin SITE_URL o PDF_RENDER_SECRET, lanza sin intentar la peticion", async () => {
    stubEnv({ SITE_URL: undefined, PDF_RENDER_SECRET: "x" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { generarPdfTabla } = await import("./pdf-render.ts");

    await expect(generarPdfTabla("Informe", ["A"], [["1"]])).rejects.toThrow(/SITE_URL|PDF_RENDER_SECRET/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("con las variables configuradas, llama al endpoint con el cuerpo y el header correctos", async () => {
    stubEnv({ SITE_URL: "https://merylay.shop", PDF_RENDER_SECRET: "secreto-real" });
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { generarPdfTabla } = await import("./pdf-render.ts");

    const bytes = await generarPdfTabla("Informe de ventas", ["Fecha", "Total"], [["2026-10-01", "$1.000"]]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://merylay.shop/api/pdf/render",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-pdf-render-secret": "secreto-real" }),
      }),
    );
    const cuerpoEnviado = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(cuerpoEnviado).toEqual({ tipo: "tabla", titulo: "Informe de ventas", encabezados: ["Fecha", "Total"], filas: [["2026-10-01", "$1.000"]] });
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("si el endpoint responde con error, lanza con el status y el cuerpo", async () => {
    stubEnv({ SITE_URL: "https://merylay.shop", PDF_RENDER_SECRET: "secreto-real" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("mensaje de error", { status: 500 })));
    const { generarPdfTabla } = await import("./pdf-render.ts");

    await expect(generarPdfTabla("Informe", [], [])).rejects.toThrow(/500/);
  });
});

describe("generarPdfTarjetas", () => {
  it("manda tipo 'tarjetas' con todos los campos", async () => {
    stubEnv({ SITE_URL: "https://merylay.shop", PDF_RENDER_SECRET: "secreto-real" });
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([9]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { generarPdfTarjetas } = await import("./pdf-render.ts");

    await generarPdfTarjetas("INFORME", "SUB", "https://x/hero.jpg", [{ valor: "1", etiqueta: "PRODUCTOS" }], [
      { fotoUrl: null, nombre: "Producto", pills: [], precio: 1000 },
    ]);

    const cuerpoEnviado = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(cuerpoEnviado.tipo).toBe("tarjetas");
    expect(cuerpoEnviado.fotoHeroUrl).toBe("https://x/hero.jpg");
    expect(cuerpoEnviado.tarjetas).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Corre el test y confirma que falla**

Run: `pnpm exec vitest run supabase/functions/whatsapp-webhook/pdf-render.test.ts`
Expected: FAIL con "Cannot find module './pdf-render.ts'".

- [ ] **Step 3: Implementa `pdf-render.ts` y borra `pdf-marca.ts`**

Crea `supabase/functions/whatsapp-webhook/pdf-render.ts`:

```ts
// Reemplaza a pdf-marca.ts: ya no dibuja PDFs con pdf-lib -- le pide a un
// endpoint de Next.js/Vercel (Puppeteer + Chromium real) que renderice HTML
// a PDF. Mismas firmas que las funciones viejas, para que reports.ts /
// owner-actions.ts / catalog.ts no tengan que cambiar sus llamadas. Ver
// docs/superpowers/specs/2026-10-08-informes-pdf-html-puppeteer-design.md.

export interface EstadisticaTarjetas {
  valor: string;
  etiqueta: string;
}

export interface TarjetaProducto {
  fotoUrl: string | null;
  nombre: string;
  pills: { etiqueta: string; valores: string[] }[];
  precio: number | null;
  nota?: string;
}

async function llamarRenderizador(cuerpo: Record<string, unknown>): Promise<Uint8Array> {
  // Fail-closed: sin estas dos variables no hay forma segura de llamar al
  // renderizador -- nunca se manda la peticion "a ver si funciona" sin
  // secreto (quien reciba la respuesta parcial no podria distinguir un PDF
  // real de un rechazo).
  const siteUrl = Deno.env.get("SITE_URL");
  const secreto = Deno.env.get("PDF_RENDER_SECRET");
  if (!siteUrl || !secreto) {
    throw new Error("Faltan SITE_URL o PDF_RENDER_SECRET para generar el PDF.");
  }

  const respuesta = await fetch(`${siteUrl}/api/pdf/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-pdf-render-secret": secreto },
    body: JSON.stringify(cuerpo),
  });

  if (!respuesta.ok) {
    const texto = await respuesta.text();
    throw new Error(`El renderizador de PDF respondio ${respuesta.status}: ${texto}`);
  }

  return new Uint8Array(await respuesta.arrayBuffer());
}

export async function generarPdfTabla(titulo: string, encabezados: string[], filas: string[][]): Promise<Uint8Array> {
  return llamarRenderizador({ tipo: "tabla", titulo, encabezados, filas });
}

export async function generarPdfTarjetas(
  titulo: string,
  subtitulo: string,
  fotoHeroUrl: string | null,
  estadisticas: EstadisticaTarjetas[],
  tarjetas: TarjetaProducto[],
): Promise<Uint8Array> {
  return llamarRenderizador({ tipo: "tarjetas", titulo, subtitulo, fotoHeroUrl, estadisticas, tarjetas });
}
```

Borra los archivos viejos:

```bash
rm supabase/functions/whatsapp-webhook/pdf-marca.ts
rm supabase/functions/whatsapp-webhook/pdf-marca.test.ts
```

- [ ] **Step 4: Corre el test y confirma que pasa**

Run: `pnpm exec vitest run supabase/functions/whatsapp-webhook/pdf-render.test.ts`
Expected: PASS (4/4).

**NOTA PARA EL IMPLEMENTADOR:** este paso deliberadamente deja a
`catalog.ts`, `owner-actions.ts` y `reports.ts` con un import roto
(`./pdf-marca.ts` ya no existe) hasta las Tasks 5 y 6. Esto es esperado por
diseño del plan (igual patrón que planes anteriores de este repo que
secuencian un borrado antes de actualizar sus consumidores) — no es una
regresión de esta tarea. `deno check` sobre esos 3 archivos fallará hasta
que termine la Task 6; la suite de Vitest de esos archivos NO se ve
afectada en este punto porque mockean el módulo completo por nombre de
archivo (ver Tasks 5/6) y Vitest no resuelve el import real.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/pdf-render.ts supabase/functions/whatsapp-webhook/pdf-render.test.ts
git rm supabase/functions/whatsapp-webhook/pdf-marca.ts supabase/functions/whatsapp-webhook/pdf-marca.test.ts
git commit -m "feat: agrega pdf-render.ts (cliente HTTP del renderizador), elimina pdf-marca.ts"
```

---

## Task 5: Fix de agrupación + import en `catalog.ts`

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/catalog.ts`
- Modify: `supabase/functions/whatsapp-webhook/catalog.test.ts`

**Interfaces:**
- Consume: `generarPdfTarjetas`/`TarjetaProducto` de `./pdf-render.ts` (Task 4).

- [ ] **Step 1: Actualiza el import**

En `catalog.ts`, reemplaza:

```ts
import { generarPdfTarjetas, type TarjetaProducto } from "./pdf-marca.ts";
```

por:

```ts
import { generarPdfTarjetas, type TarjetaProducto } from "./pdf-render.ts";
```

- [ ] **Step 2: Actualiza el mock del módulo en el test**

En `catalog.test.ts`, en el `vi.mock("./pdf-marca.ts", () => ({...}))` que
está cerca del principio del archivo (define `generarPdfTarjetas` entre
otras cosas), cambia la ruta del mock a `"./pdf-render.ts"`. El resto del
objeto mockeado no cambia.

- [ ] **Step 3: Escribe el test que falla (el bug real)**

Agrega a `catalog.test.ts`, dentro de `describe("agruparPorProducto", ...)`,
después del test existente "agrupa varias filas...":

```ts
  it("agrupa por NOMBRE incluso si vienen con distinto productId (bug real: cada talla es un producto separado en el catalogo, no una variante)", async () => {
    const { agruparPorProducto } = await import("./catalog.ts");
    const resultado = agruparPorProducto([
      { productId: "p1", variantId: null, nombre: "Camiseta algodón licrado manga doblada", talla: "S", color: null, precio: 40000, stock: 1, imageId: null, fotoUrl: "https://x/s.jpg", categoria: "Camisetas" },
      { productId: "p2", variantId: null, nombre: "Camiseta algodón licrado manga doblada", talla: "XL", color: null, precio: 40000, stock: 1, imageId: null, fotoUrl: null, categoria: "Camisetas" },
      { productId: "p3", variantId: null, nombre: "Camiseta algodón licrado manga doblada", talla: "M", color: null, precio: 40000, stock: 1, imageId: null, fotoUrl: null, categoria: "Camisetas" },
    ]);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].tallas).toEqual(["S", "XL", "M"]);
    expect(resultado[0].stockTotal).toBe(3);
  });
```

- [ ] **Step 4: Corre el test y confirma que falla**

Run: `pnpm exec vitest run supabase/functions/whatsapp-webhook/catalog.test.ts -t "agrupa por NOMBRE"`
Expected: FAIL (`resultado` tiene 3 elementos, no 1 — hoy agrupa por `productId`).

- [ ] **Step 5: Implementa el fix**

En `catalog.ts`, reemplaza el cuerpo de `agruparPorProducto`:

```ts
export function agruparPorProducto(productos: ProductoEncontrado[]): ProductoAgrupado[] {
  const porId = new Map<string, ProductoAgrupado>();
  for (const p of productos) {
    const actual = porId.get(p.productId) ?? {
```

por (cambia la clave del `Map` de `p.productId` a `p.nombre.trim()`):

```ts
// Se agrupa por NOMBRE, no por productId: en el catalogo real de MeryLay,
// cada talla de un mismo estilo puede ser un PRODUCTO separado (mismo
// nombre, distinto id/sku), no una variante dentro de product_variants.
// Agrupar por productId dejaba cada talla como su propia tarjeta -- el bug
// real que motivo este cambio. El nombre exacto SI identifica el "mismo
// estilo" en ambos casos (productos con variantes reales tambien
// comparten nombre, asi que agrupan igual que antes).
export function agruparPorProducto(productos: ProductoEncontrado[]): ProductoAgrupado[] {
  const porNombre = new Map<string, ProductoAgrupado>();
  for (const p of productos) {
    const clave = p.nombre.trim();
    const actual = porNombre.get(clave) ?? {
```

Y las dos líneas que guardan en el `Map` al final del `for` y el `return`:

```ts
    porId.set(p.productId, actual);
  }
  return [...porId.values()];
```

pasan a:

```ts
    porNombre.set(clave, actual);
  }
  return [...porNombre.values()];
```

(El resto del cuerpo del `for` -- fotoUrl/tallas/colores/precioMin/precioMax/stockTotal -- no cambia.)

- [ ] **Step 6: Corre los tests y confirma que pasan**

Run: `pnpm exec vitest run supabase/functions/whatsapp-webhook/catalog.test.ts`
Expected: PASS, todos los tests de `catalog.test.ts` (incluyendo los ya existentes de `agruparPorProducto`/`construirTarjetasProductos`, que deben seguir pasando sin cambios -- usan nombres y productIds ya consistentes entre si).

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/whatsapp-webhook/catalog.ts supabase/functions/whatsapp-webhook/catalog.test.ts
git commit -m "fix: agruparPorProducto agrupa por nombre (no productId) y usa pdf-render.ts"
```

---

## Task 6: Imports en `owner-actions.ts` y `reports.ts`

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/owner-actions.ts`
- Modify: `supabase/functions/whatsapp-webhook/owner-actions.test.ts`
- Modify: `supabase/functions/whatsapp-webhook/reports.ts`
- Modify: `supabase/functions/whatsapp-webhook/reports.test.ts`

**Interfaces:**
- Consume: `generarPdfTabla`/`generarPdfTarjetas` de `./pdf-render.ts` (Task 4). Sin cambios de firma, solo de ruta de import.

- [ ] **Step 1: Actualiza el import en `owner-actions.ts`**

Reemplaza:

```ts
import { generarPdfTabla, generarPdfTarjetas } from "./pdf-marca.ts";
```

por:

```ts
import { generarPdfTabla, generarPdfTarjetas } from "./pdf-render.ts";
```

- [ ] **Step 2: Actualiza los mocks en `owner-actions.test.ts`**

Busca las 2 ocurrencias de `vi.doMock("./pdf-marca.ts", ...)` (una en el
test de `pdf_fotos`, otra en el de `pdf_tabla`) y cambia la ruta a
`"./pdf-render.ts"` en ambas. El objeto mockeado no cambia.

- [ ] **Step 3: Actualiza el import en `reports.ts`**

Reemplaza:

```ts
import { generarPdfTabla } from "./pdf-marca.ts";
```

por:

```ts
import { generarPdfTabla } from "./pdf-render.ts";
```

- [ ] **Step 4: Actualiza el mock en `reports.test.ts`**

Busca el `vi.mock("./pdf-marca.ts", () => ({...}))` al principio del
archivo (el que mockea `generarPdfTabla` capturando sus argumentos en
`pdfLibCapturado`) y cambia la ruta a `"./pdf-render.ts"`. El objeto
mockeado no cambia.

- [ ] **Step 5: Corre ambas suites y confirma que pasan**

Run: `pnpm exec vitest run supabase/functions/whatsapp-webhook/owner-actions.test.ts supabase/functions/whatsapp-webhook/reports.test.ts`
Expected: PASS, todos los tests de ambos archivos.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/whatsapp-webhook/owner-actions.ts supabase/functions/whatsapp-webhook/owner-actions.test.ts supabase/functions/whatsapp-webhook/reports.ts supabase/functions/whatsapp-webhook/reports.test.ts
git commit -m "chore: owner-actions.ts y reports.ts importan de pdf-render.ts en vez de pdf-marca.ts"
```

---

## Task 7: Limpieza final, variables de entorno y verificación

**Files:**
- Modify: `supabase/functions/deno.json`
- Modify: `.env.local.example` (variable del lado de Supabase; ya se agregó la de Next.js en la Task 3)

**Interfaces:** ninguna nueva — esta tarea es de limpieza y verificación.

- [ ] **Step 1: Quita las dependencias de pdf-lib del lado de Supabase**

En `supabase/functions/deno.json`, quita las entradas `pdf-lib` y
`@pdf-lib/fontkit` del objeto `imports` (ya no las usa ningún archivo de
`supabase/functions/whatsapp-webhook/` tras las Tasks 4-6). El archivo
debe quedar:

```json
{
  "imports": {
    "@supabase/supabase-js": "npm:@supabase/supabase-js@2.112.1",
    "zod": "npm:zod@4.4.3"
  }
}
```

- [ ] **Step 2: Confirma que `PDF_RENDER_SECRET` ya quedó documentado**

La Task 3 (Step 2) ya agregó `PDF_RENDER_SECRET=` a `.env.local.example`.
Ese mismo valor es el que se configura tanto en Vercel (lo lee
`route.ts`) como en los secretos de Supabase (lo lee `pdf-render.ts` via
`Deno.env.get`) — es un único secreto compartido, no dos. Solo confirma
que la línea existe una vez en el archivo (`grep -c "^PDF_RENDER_SECRET="
.env.local.example` debe dar `1`); no la agregues de nuevo.

- [ ] **Step 3: Verifica que no queda ninguna referencia a `pdf-marca`**

Run: `grep -rn "pdf-marca" supabase/ docs/superpowers/plans/2026-10-07-agente-whatsapp-consultas-flexibles.md docs/superpowers/plans/2026-10-07-agente-whatsapp-informes-negocio.md 2>/dev/null || true`

Expected: sin coincidencias en código real (`supabase/functions/`); las
menciones en planes/specs VIEJOS (de antes de este cambio) son historia,
no se editan.

- [ ] **Step 4: Corre la suite completa**

Run: `pnpm test` (desde la raíz del repo — cubre tanto `src/` de Next.js
como `supabase/functions/`)
Expected: todo verde. Si algún archivo de Vitest da timeout por presión de
memoria (ya visto antes en este repo), reintenta con
`pnpm exec vitest run --no-file-parallelism`.

- [ ] **Step 5: `deno check` sobre los archivos de la Edge Function tocados**

Run (desde `supabase/functions/whatsapp-webhook/`): `npx -y deno check catalog.ts owner-actions.ts reports.ts pdf-render.ts handler.ts`
Expected: limpio, sin errores.

- [ ] **Step 6: Verificación visual manual (igual criterio que el PDF que motivó este plan)**

Corre `pnpm dev` en la raíz, y con una petición de prueba a
`POST http://localhost:3000/api/pdf/render` (con el header
`x-pdf-render-secret` igual al `PDF_RENDER_SECRET` de tu `.env.local`) y un
cuerpo `tipo: "tarjetas"` con datos de ejemplo que incluyan **al menos un
nombre de producto largo** (para confirmar que el line-clamp funciona) y
**productos con el mismo nombre y distinto dato simulado de "producto
separado por talla"** (para confirmar el fix de agrupación en
`construirTarjetasProductos`, no en el endpoint directamente — ese fix ya
se prueba en la Task 5, esto es solo una confirmación visual del
renderizado final). Guarda el PDF devuelto y ábrelo: confirma que ningún
nombre se desborda sobre la tarjeta vecina y que el diseño se parece al de
referencia del dueño (tarjetas redondeadas, sombra, insignias pill).

- [ ] **Step 7: Commit (si el Step 1 o 2 tocaron algo)**

```bash
git add supabase/functions/deno.json .env.local.example
git commit -m "chore: quita pdf-lib/@pdf-lib/fontkit de deno.json (sin consumidores tras la migracion a HTML)"
```
