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
import { ESTADO_PEDIDO_LABELS } from "@/lib/validation/pedido";

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
  const estadoLabel =
    (ESTADO_PEDIDO_LABELS as Record<string, string>)[nuevoEstado] ?? nuevoEstado;

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
            <strong>{estadoLabel}</strong>.
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
