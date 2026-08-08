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

// "pagado": el pedido ya esta pagado de verdad (hoy solo el webhook de Wompi,
// que dispara el correo unicamente cuando la transaccion quedo APPROVED).
// "recibido": el pedido apenas se creo y sigue en 'pendiente' — es el caso de
// los metodos de pago manuales (efectivo/transferencia), donde todavia no se
// ha pagado nada. Afirmar "tu pedido fue confirmado" ahi seria falso, asi que
// la variante cambia el encabezado, la intro y agrega las instrucciones de
// pago que correspondan al metodo elegido.
export type VarianteConfirmacionPedido = "recibido" | "pagado";

// Se refleja el texto que el cliente ya vio en el selector de metodo de pago
// del checkout ("Efectivo contra entrega" / "Transferencia bancaria") para no
// inventar instrucciones nuevas ni prometer datos bancarios que la tienda aun
// no publica en ningun lado.
function instruccionesDePago(metodoPago: string): string | null {
  if (metodoPago === "efectivo") {
    return "Elegiste efectivo contra entrega: pagarás al mensajero cuando recibas tu pedido.";
  }
  if (metodoPago === "transferencia") {
    return "Elegiste transferencia bancaria: nos comunicaremos contigo para darte los datos de la cuenta y coordinar el pago.";
  }
  return null;
}

export function ConfirmacionPedidoEmail({
  orderNumber,
  orderId,
  items,
  total,
  direccion,
  metodoPago,
  variante,
}: {
  orderNumber: string;
  orderId: string;
  items: ItemPedidoEmail[];
  total: number;
  direccion: DireccionEnvioEmail | null;
  metodoPago: string;
  variante: VarianteConfirmacionPedido;
}) {
  const estaPagado = variante === "pagado";
  const instrucciones = estaPagado ? null : instruccionesDePago(metodoPago);

  return (
    <Html>
      <Head />
      <Preview>
        {estaPagado
          ? `Confirmación de tu pedido ${orderNumber}`
          : `Recibimos tu pedido ${orderNumber}`}
      </Preview>
      <Body style={{ backgroundColor: "#FFF8F4", fontFamily: "Georgia, serif" }}>
        <Container style={{ padding: "32px", maxWidth: "480px" }}>
          <Heading style={{ color: "#E96A9E", fontSize: "22px" }}>
            {estaPagado ? "¡Gracias por tu compra!" : "¡Recibimos tu pedido!"}
          </Heading>
          <Text style={{ color: "#6E2A44", fontSize: "16px" }}>
            {estaPagado ? (
              <>
                Tu pedido <strong>{orderNumber}</strong> fue confirmado.
              </>
            ) : (
              <>
                Tu pedido <strong>{orderNumber}</strong> quedó registrado y está
                pendiente de pago.
              </>
            )}
          </Text>
          {instrucciones && (
            <Text style={{ color: "#6E2A44", fontSize: "14px" }}>{instrucciones}</Text>
          )}
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
