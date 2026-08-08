# Fase 11 (parte 3) — Correos transaccionales con Resend: Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enviar correos automáticos al cliente (bienvenida, confirmación de
pedido pagado, cambio de estado a enviado/entregado/cancelado) usando
Resend + `@react-email/components`, sin que un fallo de envío jamás
bloquee o revierta la operación de negocio que lo dispara.

**Architecture:** Un módulo central `enviarCorreo()` que nunca lanza
excepciones (atrapa y registra cualquier error de la API de Resend),
consumido desde cuatro puntos de disparo ya existentes (registro,
checkout manual, webhook de Wompi, cambio de estado de pedido) más una
función pura `debeNotificarCambioEstado()` que decide qué transiciones de
estado ameritan correo.

**Tech Stack:** Next.js Server Actions + Route Handlers, Resend SDK,
`@react-email/components` (plantillas como componentes React), zod,
Vitest.

## Global Constraints

- Toda la UI/copy de los correos en español.
- TypeScript estricto; nada de `any` sin justificar.
- `enviarCorreo()` **nunca lanza**: atrapa cualquier error de Resend, lo
  registra con `console.error`, y retorna `{ error: string } | { id: string }`.
  Ningún llamador debe tratar un fallo de envío como fallo de la operación
  principal (registro, checkout, cambio de estado).
- Cada llamada a `enviarCorreo()` se **espera** (`await`) — el proyecto
  corre en funciones serverless (Vercel), donde una promesa sin `await`
  puede no completarse antes de que la función termine. Esperarla no
  vuelve la operación "bloqueante" en el sentido de fallar: solo garantiza
  que el intento de envío efectivamente ocurre.
- `RESEND_API_KEY` es server-only — nunca se importa desde código de
  cliente (Client Components).
- Remitente fijo: `"MeryLay Boutique <pedidos@merylays.shop>"`.
- El correo de confirmación de pedido se dispara solo cuando el pedido
  queda `pagado` (nunca al crearse `pendiente`).
- El correo de cambio de estado se dispara solo para `enviado`, `entregado`,
  `cancelado` — nunca para `pagado` (que ya tiene su propio correo por otra
  vía) ni para una transición a un estado igual al actual.
- Commits atómicos en español después de cada tarea funcional.
- Spec de referencia: `docs/superpowers/specs/2026-08-08-fase-11-3-correos-transaccionales-design.md`.

---

## Mapa de archivos

```
src/lib/email/resend.ts                        # nuevo — enviarCorreo()
src/lib/email/notificaciones.ts                 # nuevo — debeNotificarCambioEstado()
src/lib/email/__tests__/notificaciones.test.ts  # nuevo

src/lib/email/templates/bienvenida-email.tsx           # nuevo
src/lib/email/templates/confirmacion-pedido-email.tsx  # nuevo
src/lib/email/templates/cambio-estado-email.tsx         # nuevo

src/app/(auth)/registro/actions.ts              # modificado — dispara bienvenida
src/app/(store)/checkout/actions.ts             # modificado — dispara confirmacion (manual)
src/app/api/webhooks/wompi/route.ts             # modificado — dispara confirmacion (Wompi)
src/app/admin/pedidos/actions.ts                # modificado — dispara cambio de estado
```

---

### Task 1: Lógica pura — `debeNotificarCambioEstado`

**Files:**
- Create: `src/lib/email/notificaciones.ts`
- Test: `src/lib/email/__tests__/notificaciones.test.ts`

**Interfaces:**
- Produces: `debeNotificarCambioEstado(nuevoEstado: string): boolean` —
  usado por Task 6 (`admin/pedidos/actions.ts`).

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { debeNotificarCambioEstado } from "../notificaciones";

describe("debeNotificarCambioEstado", () => {
  it("notifica cuando el pedido se marca enviado", () => {
    expect(debeNotificarCambioEstado("enviado")).toBe(true);
  });

  it("notifica cuando el pedido se marca entregado", () => {
    expect(debeNotificarCambioEstado("entregado")).toBe(true);
  });

  it("notifica cuando el pedido se marca cancelado", () => {
    expect(debeNotificarCambioEstado("cancelado")).toBe(true);
  });

  it("no notifica cuando el pedido se marca pagado (tiene su propio correo)", () => {
    expect(debeNotificarCambioEstado("pagado")).toBe(false);
  });

  it("no notifica cuando el pedido se marca pendiente", () => {
    expect(debeNotificarCambioEstado("pendiente")).toBe(false);
  });

  it("no notifica para un valor invalido", () => {
    expect(debeNotificarCambioEstado("cualquiercosa")).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test src/lib/email/__tests__/notificaciones.test.ts`
Expected: FAIL (módulo `../notificaciones` no existe)

- [ ] **Step 3: Implementación mínima**

```ts
const ESTADOS_NOTIFICABLES = new Set(["enviado", "entregado", "cancelado"]);

export function debeNotificarCambioEstado(nuevoEstado: string): boolean {
  return ESTADOS_NOTIFICABLES.has(nuevoEstado);
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm test src/lib/email/__tests__/notificaciones.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/notificaciones.ts src/lib/email/__tests__/notificaciones.test.ts
git commit -m "feat: logica de que transiciones de pedido notifican por correo (Fase 11.3)"
```

---

### Task 2: Dependencias + módulo de envío `enviarCorreo`

**Files:**
- Modify: `package.json` (vía `pnpm add`)
- Create: `src/lib/email/resend.ts`

**Interfaces:**
- Produces: `enviarCorreo(params: { to: string; subject: string; react: React.ReactElement }): Promise<{ error: string } | { id: string }>`
  — usado por Tasks 3–6.

- [ ] **Step 1: Instalar dependencias**

```bash
pnpm add resend @react-email/components
```

- [ ] **Step 2: Implementación**

```ts
import { Resend } from "resend";
import type { ReactElement } from "react";

const REMITENTE = "MeryLay Boutique <pedidos@merylays.shop>";

export async function enviarCorreo(params: {
  to: string;
  subject: string;
  react: ReactElement;
}): Promise<{ error: string } | { id: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[email] RESEND_API_KEY no esta configurado — correo no enviado.");
    return { error: "RESEND_API_KEY no configurado." };
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: REMITENTE,
      to: params.to,
      subject: params.subject,
      react: params.react,
    });

    if (error) {
      console.error(
        `[email] Resend rechazo el envio a ${params.to} ("${params.subject}"):`,
        error,
      );
      return { error: error.message };
    }

    return { id: data?.id ?? "" };
  } catch (error) {
    console.error(
      `[email] Error inesperado enviando a ${params.to} ("${params.subject}"):`,
      error,
    );
    return { error: "Error inesperado al enviar el correo." };
  }
}
```

Nota: el bloque `try/catch` es intencional además del `{ data, error }` que
ya retorna el SDK de Resend — cubre fallos de red/DNS u otras excepciones
que el SDK pueda lanzar en vez de retornar como `error`, garantizando que
`enviarCorreo` en verdad nunca propaga una excepción, tal como exige el
Global Constraint.

- [ ] **Step 3: Verificar tipos**

Run: `pnpm tsc --noEmit`
Expected: sin errores nuevos relacionados a este archivo

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/email/resend.ts
git commit -m "feat: modulo de envio de correos con Resend (Fase 11.3)"
```

---

### Task 3: Plantilla y disparo de correo de bienvenida

**Files:**
- Create: `src/lib/email/templates/bienvenida-email.tsx`
- Modify: `src/app/(auth)/registro/actions.ts`

**Interfaces:**
- Consumes: `enviarCorreo` (Task 2).
- Produces: componente `BienvenidaEmail({ nombre }: { nombre: string })`.

- [ ] **Step 1: Crear la plantilla**

```tsx
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from "@react-email/components";

export function BienvenidaEmail({ nombre }: { nombre: string }) {
  return (
    <Html>
      <Head />
      <Preview>Bienvenida a MeryLay Boutique</Preview>
      <Body style={{ backgroundColor: "#FFF8F4", fontFamily: "Georgia, serif" }}>
        <Container style={{ padding: "32px", maxWidth: "480px" }}>
          <Heading style={{ color: "#E96A9E", fontSize: "24px" }}>
            Inspiración Femenina
          </Heading>
          <Text style={{ color: "#6E2A44", fontSize: "16px" }}>
            Hola {nombre},
          </Text>
          <Text style={{ color: "#6E2A44", fontSize: "16px" }}>
            ¡Gracias por unirte a MeryLay Boutique! Tu cuenta ya está lista
            para que descubras nuestra colección.
          </Text>
          <Link
            href="https://merylays.shop"
            style={{
              display: "inline-block",
              marginTop: "16px",
              backgroundColor: "#E96A9E",
              color: "#FFF8F4",
              padding: "12px 24px",
              borderRadius: "8px",
              textDecoration: "none",
            }}
          >
            Ir a la tienda
          </Link>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 2: Disparar el envío en `registro/actions.ts`**

Modificar el archivo agregando el envío justo antes de cada `return`
exitoso (tanto el caso `data.session` como el caso de confirmación
pendiente), tras la creación exitosa del usuario:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { registroSchema, type RegistroInput } from "@/lib/validation/auth";
import { enviarCorreo } from "@/lib/email/resend";
import { BienvenidaEmail } from "@/lib/email/templates/bienvenida-email";

export async function registro(
  input: RegistroInput,
): Promise<{ error?: string; message?: string; success?: boolean }> {
  const parsed = registroSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already registered")) {
      return { error: "Ya existe una cuenta con ese correo electrónico." };
    }
    return { error: "No pudimos crear tu cuenta. Intenta de nuevo." };
  }

  await enviarCorreo({
    to: parsed.data.email,
    subject: "Bienvenida a MeryLay Boutique",
    react: BienvenidaEmail({ nombre: parsed.data.fullName }),
  });

  if (data.session) {
    return { success: true };
  }

  return {
    message:
      "Registro exitoso. Revisa tu correo electrónico para confirmar tu cuenta.",
  };
}
```

- [ ] **Step 3: Verificar build y lint**

Run: `pnpm build && pnpm lint`
Expected: ambos exitosos

- [ ] **Step 4: Commit**

```bash
git add src/lib/email/templates/bienvenida-email.tsx "src/app/(auth)/registro/actions.ts"
git commit -m "feat: correo de bienvenida al registrarse (Fase 11.3)"
```

---

### Task 4: Plantilla de confirmación de pedido + disparo en checkout manual

**Files:**
- Create: `src/lib/email/templates/confirmacion-pedido-email.tsx`
- Modify: `src/app/(store)/checkout/actions.ts`

**Interfaces:**
- Consumes: `enviarCorreo` (Task 2), `formatPrice` de `@/lib/format`
  (existente).
- Produces: componente `ConfirmacionPedidoEmail({ orderNumber, items,
  total, direccion, metodoPago }: ConfirmacionPedidoEmailProps)` —
  reutilizado también por Task 5 (webhook de Wompi).

- [ ] **Step 1: Crear la plantilla**

```tsx
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Text,
} from "@react-email/components";
import { formatPrice } from "@/lib/format";

export type ItemPedidoEmail = {
  nombre: string;
  qty: number;
  lineTotal: number;
};

export type DireccionEnvioEmail = {
  fullName?: string;
  address?: string;
  city?: string;
};

export function ConfirmacionPedidoEmail({
  orderNumber,
  orderId,
  items,
  total,
  direccion,
  metodoPago,
}: {
  orderNumber: string;
  orderId: string;
  items: ItemPedidoEmail[];
  total: number;
  direccion: DireccionEnvioEmail | null;
  metodoPago: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>Confirmación de tu pedido {orderNumber}</Preview>
      <Body style={{ backgroundColor: "#FFF8F4", fontFamily: "Georgia, serif" }}>
        <Container style={{ padding: "32px", maxWidth: "480px" }}>
          <Heading style={{ color: "#E96A9E", fontSize: "22px" }}>
            ¡Gracias por tu compra!
          </Heading>
          <Text style={{ color: "#6E2A44", fontSize: "16px" }}>
            Tu pedido <strong>{orderNumber}</strong> fue confirmado.
          </Text>
          <Hr style={{ borderColor: "#F8D4DD" }} />
          {items.map((item, index) => (
            <Text key={index} style={{ color: "#6E2A44", fontSize: "14px" }}>
              {item.nombre} × {item.qty} — {formatPrice(item.lineTotal)}
            </Text>
          ))}
          <Hr style={{ borderColor: "#F8D4DD" }} />
          <Text style={{ color: "#E96A9E", fontSize: "18px", fontWeight: "bold" }}>
            Total: {formatPrice(total)}
          </Text>
          <Text style={{ color: "#6E2A44", fontSize: "14px" }}>
            Método de pago: {metodoPago}
          </Text>
          {direccion && (
            <Text style={{ color: "#6E2A44", fontSize: "14px" }}>
              Envío a: {direccion.fullName}, {direccion.address}, {direccion.city}
            </Text>
          )}
          <Link
            href={`https://merylays.shop/cuenta/pedidos/${orderId}`}
            style={{
              display: "inline-block",
              marginTop: "16px",
              backgroundColor: "#E96A9E",
              color: "#FFF8F4",
              padding: "12px 24px",
              borderRadius: "8px",
              textDecoration: "none",
            }}
          >
            Ver mi pedido
          </Link>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 2: Disparar el envío en `checkout/actions.ts`**

Modificar `confirmarPedido` para enviar el correo tras el `create_order`
exitoso, **antes** del `redirect(...)` (que interrumpe la ejecución). Se
necesita el email del usuario (de la sesión ya autenticada) y los ítems
del pedido recién creado:

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkoutSchema, type CheckoutInput } from "@/lib/validation/checkout";
import { enviarCorreo } from "@/lib/email/resend";
import { ConfirmacionPedidoEmail } from "@/lib/email/templates/confirmacion-pedido-email";

export async function confirmarPedido(input: CheckoutInput): Promise<{ error?: string }> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success || parsed.data.paymentMethod === "wompi") {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_order", {
    p_shipping_address: {
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
      address: parsed.data.address,
      city: parsed.data.city,
      notes: parsed.data.notes || null,
    },
    p_payment_method: parsed.data.paymentMethod,
  });

  if (error || !data) {
    return { error: error?.message ?? "No se pudo completar el pedido." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.email) {
    const { data: items } = await supabase
      .from("order_items")
      .select("name_snapshot, qty, line_total")
      .eq("order_id", data.id);

    await enviarCorreo({
      to: user.email,
      subject: `Confirmación de tu pedido ${data.order_number}`,
      react: ConfirmacionPedidoEmail({
        orderNumber: data.order_number,
        orderId: data.id,
        items: (items ?? []).map((item) => ({
          nombre: item.name_snapshot,
          qty: item.qty,
          lineTotal: item.line_total,
        })),
        total: data.total,
        direccion: parsed.data,
        metodoPago: parsed.data.paymentMethod,
      }),
    });
  }

  redirect(`/cuenta/pedidos/${data.id}?confirmado=1`);
}
```

- [ ] **Step 3: Verificar build y lint**

Run: `pnpm build && pnpm lint`
Expected: ambos exitosos

- [ ] **Step 4: Commit**

```bash
git add src/lib/email/templates/confirmacion-pedido-email.tsx "src/app/(store)/checkout/actions.ts"
git commit -m "feat: correo de confirmacion de pedido en checkout manual (Fase 11.3)"
```

---

### Task 5: Disparo de confirmación de pedido en el webhook de Wompi

**Files:**
- Modify: `src/app/api/webhooks/wompi/route.ts`

**Interfaces:**
- Consumes: `enviarCorreo` (Task 2), `ConfirmacionPedidoEmail`,
  `type ItemPedidoEmail` (Task 4), `createAdminClient()` de
  `@/lib/supabase/admin` (ya importado en este archivo).

- [ ] **Step 1: Agregar el import y el envío**

Agregar los imports al inicio del archivo:

```ts
import { enviarCorreo } from "@/lib/email/resend";
import { ConfirmacionPedidoEmail } from "@/lib/email/templates/confirmacion-pedido-email";
```

Dentro del bloque `if (transaccion.status === "APPROVED")`, después de que
`errorRpc` se confirma ausente (pago realmente confirmado) y antes del
`else if`, agregar:

```ts
    if (!errorRpc) {
      const { data: pedidoCompleto } = await admin
        .from("orders")
        .select("id, order_number, total, payment_method, user_id, shipping_address")
        .eq("id", pedido.id)
        .single();

      if (pedidoCompleto) {
        const { data: usuario } = await admin.auth.admin.getUserById(
          pedidoCompleto.user_id,
        );
        const { data: items } = await admin
          .from("order_items")
          .select("name_snapshot, qty, line_total")
          .eq("order_id", pedidoCompleto.id);

        if (usuario.user?.email) {
          const direccion = pedidoCompleto.shipping_address as {
            fullName?: string;
            address?: string;
            city?: string;
          } | null;

          await enviarCorreo({
            to: usuario.user.email,
            subject: `Confirmación de tu pedido ${pedidoCompleto.order_number}`,
            react: ConfirmacionPedidoEmail({
              orderNumber: pedidoCompleto.order_number,
              orderId: pedidoCompleto.id,
              items: (items ?? []).map((item) => ({
                nombre: item.name_snapshot,
                qty: item.qty,
                lineTotal: item.line_total,
              })),
              total: pedidoCompleto.total,
              direccion,
              metodoPago: pedidoCompleto.payment_method ?? "wompi",
            }),
          });
        }
      }
    }
```

Nota: se envía el correo **solo si `errorRpc` está ausente** — si la
confirmación de pago falló (p. ej. el pedido ya no estaba `pendiente`), no
se debe notificar un pedido que en realidad no quedó pagado.

- [ ] **Step 2: Verificar build, lint y tests completos**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos; suite completa en verde, incluyendo el
archivo de tests existente del webhook (`route.test.ts`) sin regresiones —
si algún test de ese archivo mockea `admin.from`/`admin.auth.admin` de
forma estricta y falla por las nuevas llamadas, ajustar el mock para
tolerar las llamadas adicionales sin cambiar las aserciones existentes
sobre el comportamiento ya cubierto.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/webhooks/wompi/route.ts
git commit -m "feat: correo de confirmacion de pedido tras pago aprobado por Wompi (Fase 11.3)"
```

---

### Task 6: Plantilla de cambio de estado + disparo en `cambiarEstadoPedido`

**Files:**
- Create: `src/lib/email/templates/cambio-estado-email.tsx`
- Modify: `src/app/admin/pedidos/actions.ts`

**Interfaces:**
- Consumes: `enviarCorreo` (Task 2), `debeNotificarCambioEstado` (Task 1),
  `createAdminClient()` de `@/lib/supabase/admin` (existente, mismo patrón
  ya usado en el webhook).

- [ ] **Step 1: Crear la plantilla**

```tsx
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from "@react-email/components";

const MENSAJES_ESTADO: Record<string, string> = {
  enviado: "Tu pedido fue enviado",
  entregado: "Tu pedido fue entregado",
  cancelado: "Tu pedido fue cancelado",
};

export function CambioEstadoEmail({
  orderNumber,
  orderId,
  nuevoEstado,
}: {
  orderNumber: string;
  orderId: string;
  nuevoEstado: string;
}) {
  const mensaje = MENSAJES_ESTADO[nuevoEstado] ?? "Tu pedido cambió de estado";

  return (
    <Html>
      <Head />
      <Preview>{mensaje}</Preview>
      <Body style={{ backgroundColor: "#FFF8F4", fontFamily: "Georgia, serif" }}>
        <Container style={{ padding: "32px", maxWidth: "480px" }}>
          <Heading style={{ color: "#E96A9E", fontSize: "22px" }}>
            {mensaje}
          </Heading>
          <Text style={{ color: "#6E2A44", fontSize: "16px" }}>
            Tu pedido <strong>{orderNumber}</strong> ahora está{" "}
            <strong>{nuevoEstado}</strong>.
          </Text>
          <Link
            href={`https://merylays.shop/cuenta/pedidos/${orderId}`}
            style={{
              display: "inline-block",
              marginTop: "16px",
              backgroundColor: "#E96A9E",
              color: "#FFF8F4",
              padding: "12px 24px",
              borderRadius: "8px",
              textDecoration: "none",
            }}
          >
            Ver mi pedido
          </Link>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 2: Disparar el envío en `cambiarEstadoPedido`**

Reemplazar el contenido completo de `src/app/admin/pedidos/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { estadoPedidoSchema } from "@/lib/validation/pedido";
import { debeNotificarCambioEstado } from "@/lib/email/notificaciones";
import { enviarCorreo } from "@/lib/email/resend";
import { CambioEstadoEmail } from "@/lib/email/templates/cambio-estado-email";

export async function cambiarEstadoPedido(
  orderId: string,
  nuevoEstado: string,
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = estadoPedidoSchema.safeParse(nuevoEstado);
  if (!parsed.success) {
    return { error: "Estado inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .update({ status: parsed.data })
    .eq("id", orderId);

  if (error) {
    return { error: "No se pudo actualizar el pedido." };
  }

  if (debeNotificarCambioEstado(parsed.data)) {
    const admin = createAdminClient();
    const { data: pedido } = await admin
      .from("orders")
      .select("id, order_number, user_id")
      .eq("id", orderId)
      .single();

    if (pedido) {
      const { data: usuario } = await admin.auth.admin.getUserById(pedido.user_id);
      if (usuario.user?.email) {
        await enviarCorreo({
          to: usuario.user.email,
          subject: `Actualización de tu pedido ${pedido.order_number}`,
          react: CambioEstadoEmail({
            orderNumber: pedido.order_number,
            orderId: pedido.id,
            nuevoEstado: parsed.data,
          }),
        });
      }
    }
  }

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  return {};
}
```

- [ ] **Step 3: Verificar build, lint y tests completos**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos; suite completa en verde.

- [ ] **Step 4: Commit**

```bash
git add src/lib/email/templates/cambio-estado-email.tsx src/app/admin/pedidos/actions.ts
git commit -m "feat: correo de cambio de estado de pedido (Fase 11.3)"
```

---

### Task 7: Verificación de integración end-to-end contra Resend real

**Files:** ninguno nuevo (script desechable, no se commitea).

**Interfaces:**
- Consumes: `enviarCorreo` (Task 2), las tres plantillas (Tasks 3, 4, 6).

- [ ] **Step 1: Confirmar que `RESEND_API_KEY` y el dominio están listos**

Confirmar (ya reportado por el dueño del proyecto) que `RESEND_API_KEY`
está en `.env.local` y que `merylays.shop` aparece como `Verified` en el
dashboard de Resend. Si alguna de las dos condiciones no se cumple, no
continuar — pedir al dueño del proyecto que las resuelva primero.

- [ ] **Step 2: Script de verificación (`.mjs` desechable)**

Crear `scripts/tmp-verify-fase11-3.mjs` (fuera de `src/`, para borrar al
final) que, usando `dotenv` + `.env.local` (mismo patrón que scripts de
verificación anteriores) y el SDK de `resend` directamente:

1. Envíe `BienvenidaEmail({ nombre: "Cliente de Prueba" })` a una
   dirección de prueba (pedir al dueño del proyecto una dirección de
   correo suya donde pueda revisar la bandeja de entrada, o usar la misma
   cuenta asociada a la API key de Resend si el dueño confirma que puede
   revisarla).
2. Envíe `ConfirmacionPedidoEmail(...)` con datos de ejemplo (número de
   pedido ficticio, 2 ítems, total, dirección, método de pago) a la misma
   dirección.
3. Envíe `CambioEstadoEmail(...)` con datos de ejemplo (`nuevoEstado:
   "enviado"`) a la misma dirección.
4. Para cada uno, confirme que Resend responde sin `error` y con un `id`
   de envío no vacío — esto prueba que la API aceptó el correo, no que
   llegó a la bandeja de entrada (eso se confirma leyendo el correo
   manualmente, fuera del script).
5. Imprima los tres `id` de envío para que el dueño del proyecto pueda
   confirmarlos en el dashboard de Resend (`Emails` → buscar por ID).

Run: `node scripts/tmp-verify-fase11-3.mjs`
Expected: los tres envíos retornan un `id`, sin `error`.

- [ ] **Step 3: Confirmación manual (fuera del script)**

Pedir al dueño del proyecto que confirme, revisando la bandeja de entrada
de la dirección de prueba, que los tres correos llegaron, se ven
correctamente formateados (colores de marca, texto en español, enlaces
funcionando) y no cayeron en spam.

- [ ] **Step 4: Limpieza**

```bash
rm -f scripts/tmp-verify-fase11-3.mjs
```

No hay commit en esta tarea — es puramente de verificación.

---

## Cierre de fase

Al completar la Task 7, invocar `superpowers:finishing-a-development-branch`
sobre la rama de esta sub-fase (creada al iniciar la ejecución de este
plan, con base en `master`) para fusionar, verificar y subir.
