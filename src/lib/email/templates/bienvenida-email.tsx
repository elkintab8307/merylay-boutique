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
