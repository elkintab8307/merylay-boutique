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
