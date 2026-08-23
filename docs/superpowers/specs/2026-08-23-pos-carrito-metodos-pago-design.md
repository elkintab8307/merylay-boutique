# Rediseño POS — Sub-proyecto 4: Carrito y métodos de pago

> Sub-proyecto 4 de 5 del rediseño visual del POS. Los sub-proyectos 1
> (layout y navegación), 2 (módulo de clientes) y 3 (navegación de
> productos) ya están en producción (PR #25, PR #26, PR #27). El
> sub-proyecto 5 (capa móvil) tiene su propio ciclo de spec → plan →
> implementación, por separado.

## Contexto

El panel derecho de `VentaItemsEditor` (`src/app/pos/venta-items-editor.tsx`)
—el carrito de venta— no se ha tocado en los sub-proyectos anteriores.
Hoy:

- Cada línea del carrito es solo texto: nombre, precio, stepper de
  cantidad, botón "Quitar". Sin imagen, aunque `LocalCartItem.imageUrl`
  (`src/lib/cart/local-cart.ts`) ya viene poblado correctamente desde
  el sub-proyecto 3 **cuando el ítem se agrega vía `ProductBrowser`**
  (antes siempre era `null` en ese camino). Los dos flujos de EDICIÓN
  (`/pos/venta/[id]/editar` y `/admin/pedidos/[id]/editar`) construyen
  sus `itemsIniciales` directamente desde la base de datos con
  `imageUrl: null` hardcodeado (`page.tsx` de cada uno) — este
  sub-proyecto no corrige eso; ver "Fuera de alcance".
- El método de pago es un `<select>` de texto plano con seis opciones
  (`efectivo`, `tarjeta`, `transferencia`, `nequi`, `daviplata`,
  `credito`, esta última solo si `permitirCredito`).
- El bloque de crédito (cuotas, abono inicial, método del abono) ya
  funciona: `numCuotas`, `abonoInicial`, `abonoInicialMetodo`,
  validado en `handleSubmit`. El método del abono es otro `<select>`
  con las mismas cinco opciones sin crédito
  (`METODOS_ABONO` en `venta-items-editor.tsx`).
- `VentaItemsEditor` es compartido por 3 consumidores: la terminal POS
  (`/pos`), la edición de venta (`/pos/venta/[id]/editar`), y la
  edición de pedidos de tienda online
  (`src/app/admin/pedidos/[id]/editar/pedido-editar-form.tsx`, que ya
  oculta descuento/método de pago/cliente vía
  `mostrarDescuento={false} mostrarMetodoPago={false}
  mostrarCliente={false}`).

Este sub-proyecto es puramente visual/de interacción: no cambia la
lógica de negocio, ni el contrato de `onGuardar`, ni ningún RPC o
server action. Todo el trabajo vive en `venta-items-editor.tsx` más un
componente nuevo reutilizable para los botones de método de pago.

## Decisiones de alcance (ya confirmadas con el usuario)

- **Botones de método de pago**: ícono + etiqueta corta (no solo
  ícono) — más claro para Nequi/Daviplata, que no tienen un ícono
  universalmente reconocible.
- **Íconos por método** (lucide-react, ya verificados en la versión
  instalada): efectivo → `Banknote`, tarjeta → `CreditCard`,
  transferencia → `Landmark`, nequi → `Smartphone`, daviplata →
  `Smartphone` (mismo ícono genérico para ambas, no existe uno
  específico), crédito → `Wallet`.
- **Grilla de 3 columnas**: 2 filas de 3 para el método principal (6
  opciones), botones grandes y fáciles de tocar en pantalla táctil.
- **Miniatura en cada línea del carrito**: sí, a la izquierda del
  nombre — mismo criterio visual que `ProductCardPos` del
  sub-proyecto 3 (fondo `bg-brand-rosa-claro` si no hay imagen).
- **Bloque de crédito**: se le da tratamiento visual propio (no solo
  reordenar), manteniendo exactamente la misma lógica y validaciones.
- **Método del abono inicial**: también se convierte en botones-ícono,
  reutilizando el mismo componente en una variante compacta (sin la
  opción crédito).
- **Alcance**: aplica a los 3 consumidores de `VentaItemsEditor` por
  igual, vía el mismo componente compartido. El consumidor de pedidos
  de tienda online (que ya oculta descuento/método/cliente) solo
  hereda el rediseño de la línea de carrito con miniatura.

## Diseño

### 1. `PaymentMethodPicker` (nuevo componente reutilizable)

Nuevo `src/app/pos/payment-method-picker.tsx` (client component).
Grilla de botones tipo chip, ícono arriba + etiqueta corta debajo,
mismo lenguaje visual que las píldoras de categoría de
`ProductBrowser` (sub-proyecto 3): estado activo con `border-brand-rosa
bg-brand-rosa text-brand-crema`, inactivo con `border-brand-rosa-claro
text-brand-ciruela`.

```ts
type PaymentMethodOption = {
  value: PaymentMethod; // Database["public"]["Enums"]["payment_method"]
  label: string;
  Icon: LucideIcon;
};

export function PaymentMethodPicker({
  options,
  value,
  onChange,
  compact,
}: {
  options: PaymentMethodOption[];
  value: PaymentMethod | "";
  onChange: (value: PaymentMethod) => void;
  compact?: boolean;
}): JSX.Element
```

- `options` se arma en `venta-items-editor.tsx` con el mapa fijo de
  íconos de la sección de alcance. Dos listas: `METODOS_PAGO_PRINCIPAL`
  (6 opciones, incluye crédito solo si `permitirCredito`) y
  `METODOS_ABONO` (5 opciones, sin crédito, ya existe como array de
  strings — se convierte al mismo shape `PaymentMethodOption[]`).
- `compact` reduce el tamaño de ícono/texto/padding para el uso dentro
  del bloque de crédito (abono inicial) sin duplicar el componente.
- Grilla siempre de 3 columnas (`grid grid-cols-3 gap-2`), tanto para
  6 opciones (2 filas) como para 5 (2 filas, la última con un hueco).
- Sin dependencias de datos: es un componente puramente controlado
  (value/onChange), sin `useState` propio ni fetch.

### 2. Línea de carrito con miniatura

Modificación del bloque `items.map(...)` en `venta-items-editor.tsx`:
cada fila agrega una miniatura de 44×44px (`aspect-square`,
`rounded-md`, `bg-brand-rosa-claro`) a la izquierda del nombre/precio,
usando `next/image` con `item.imageUrl` cuando existe (mismo criterio
de fallback que `ProductCardPos`: si `imageUrl` es `null`, se muestra
solo el fondo rosa claro, sin ícono ni texto placeholder — consistente
con la decisión ya tomada en el sub-proyecto 3 de no añadir un label
"Sin imagen"). El resto de la fila (nombre, precio, stepper, botón
"Quitar") no cambia de comportamiento, solo se reacomoda para convivir
con la miniatura.

### 3. Método de pago principal

El bloque `mostrarMetodoPago` reemplaza el `<select>` por
`<PaymentMethodPicker options={METODOS_PAGO_PRINCIPAL} value={paymentMethod}
onChange={setPaymentMethod} />`. `paymentMethod`, `setPaymentMethod`,
y el resto del flujo (`esCredito = paymentMethod === "credito" &&
permitirCredito`) no cambian.

### 4. Bloque de crédito con tratamiento visual propio

El bloque `esCredito && (...)` se conserva íntegro en lógica
(`numCuotas`, `abonoInicial`, `abonoInicialMetodo`, las validaciones en
`handleSubmit`), con estos cambios visuales:

- Encabezado con ícono `Wallet` (lucide-react) junto al texto "Datos
  del crédito", en vez de solo texto en negrita.
- Los inputs de "Número de cuotas" y "Abono inicial (opcional)" pasan
  a una grilla de 2 columnas (`grid grid-cols-2 gap-3`) en vez de
  apilados verticalmente.
- El `<select>` de método del abono inicial se reemplaza por
  `<PaymentMethodPicker options={METODOS_ABONO_PICKER} value={abonoInicialMetodo}
  onChange={setAbonoInicialMetodo} compact />`, mostrado solo cuando
  `abonoInicial > 0` (mismo comportamiento condicional que hoy).
- El contenedor del bloque conserva su estilo de tarjeta distintiva
  (`border-brand-oro/50 bg-brand-oro/10`), reforzando que es un
  sub-flujo dentro del carrito.

### 5. Alcance en los 3 consumidores

Como todo el cambio vive en el componente compartido, los 3
consumidores lo heredan automáticamente:

- `/pos` (terminal) y `/pos/venta/[id]/editar` (edición de venta):
  reciben el rediseño completo (miniatura, botones de método,
  bloque de crédito).
- `pedido-editar-form.tsx`: con `mostrarDescuento={false}
  mostrarMetodoPago={false} mostrarCliente={false}`, `esCredito` nunca
  es `true` (depende de `paymentMethod === "credito"`, que solo se
  puede alcanzar si el `<PaymentMethodPicker>` es visible). Este
  consumidor solo ve el cambio de la línea de carrito con miniatura;
  no hay botones de pago ni bloque de crédito que rediseñar ahí, sin
  cambio de código adicional en `pedido-editar-form.tsx` más allá de
  lo que ya hereda del componente compartido.

## Fuera de alcance (explícitamente diferido)

- Capa específica de móvil (layout propio de la grilla de pago/carrito
  para pantallas pequeñas) → sub-proyecto 5.
- Cualquier cambio a la lógica de crédito, validaciones, RPCs, o al
  contrato de `onGuardar` — el alcance es estrictamente visual.
- Íconos específicos de marca para Nequi/Daviplata (ej. logos reales)
  — se usa `Smartphone` genérico para ambos; un ícono de marca real
  requeriría assets propios fuera del alcance de este sub-proyecto.
- **Poblar `imageUrl` en los flujos de edición** (`/pos/venta/[id]/editar`
  y `/admin/pedidos/[id]/editar`) — hallazgo real de la revisión final:
  ambos `page.tsx` construyen `itemsIniciales` con `imageUrl: null`
  hardcodeado, así que la miniatura del carrito de este sub-proyecto
  solo se ve poblada para ítems agregados en la sesión actual vía
  `ProductBrowser`; los ítems pre-cargados en esas dos páginas muestran
  el cuadro rosa vacío. Corregirlo requiere traer la imagen principal
  del producto en la consulta de cada `page.tsx` — fuera del alcance
  de 2 archivos declarado aquí. Follow-up recomendado, no bloqueante.

## Testing

- Este sub-proyecto no introduce lógica de negocio nueva (es
  presentacional/de interacción), así que sigue el mismo criterio ya
  usado para `ProductCardPos`/`ProductBrowser` en el sub-proyecto 3:
  sin test unitario dedicado para `PaymentMethodPicker` ni para los
  cambios en `venta-items-editor.tsx`.
- Verificación: `pnpm tsc --noEmit` y `pnpm build` deben pasar limpio
  en los 3 consumidores (incluye `pedido-editar-form.tsx`, que no se
  modifica pero debe seguir compilando con el componente compartido
  cambiado).
- Verificación manual: igual que los sub-proyectos anteriores, `/pos/**`
  requiere sesión autenticada y la contraseña del superadmin no se
  maneja en texto plano en esta sesión — la verificación visual final
  (grilla de botones de pago, miniaturas del carrito, bloque de
  crédito) la hace el usuario en el preview desplegado.

## Preguntas abiertas (a resolver en el plan de implementación, no bloquean el spec)

- Nombre exacto de los archivos/props puede ajustarse levemente en la
  fase de plan si choca con una convención ya establecida que no se
  detectó aquí — el contrato de datos (`PaymentMethodOption`,
  `PaymentMethodPicker`) es lo que no cambia.
