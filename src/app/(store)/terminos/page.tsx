import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Condiciones del Servicio — MeryLay Boutique",
  description:
    "Términos y condiciones de uso y compra en MeryLay Boutique, tienda de moda femenina.",
};

const ACTUALIZADO = "1 de octubre de 2026";

export default function TerminosPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl text-brand-ciruela">
          Condiciones del Servicio
        </h1>
        <p className="text-sm text-brand-ciruela/70">
          Última actualización: {ACTUALIZADO}
        </p>
      </header>

      <div className="flex flex-col gap-8 text-sm leading-relaxed text-brand-ciruela/90">
        <section className="flex flex-col gap-2">
          <p>
            Estas Condiciones del Servicio (&quot;Términos&quot;) regulan el uso
            del sitio web merylay.shop y la compra de productos de{" "}
            <strong>MeryLay Boutique</strong>, tienda de moda femenina ubicada en
            Armenia, Quindío, Colombia. Al navegar en nuestro sitio, contactarnos
            por WhatsApp o realizar una compra, aceptas estos Términos.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">
            1. Productos y precios
          </h2>
          <p>
            Los precios se muestran en pesos colombianos (COP) e incluyen los
            impuestos aplicables, salvo que se indique lo contrario. Procuramos
            que la información y fotografías de los productos sean precisas; sin
            embargo, pueden existir variaciones leves de color por el dispositivo
            de visualización. Nos reservamos el derecho de corregir errores de
            precio o disponibilidad antes de confirmar un pedido.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">
            2. Proceso de compra y pago
          </h2>
          <p>
            Puedes realizar tu pedido a través del sitio web o por WhatsApp.
            Aceptamos pago contra entrega (efectivo), transferencia bancaria y
            pago en línea seguro con tarjeta a través de{" "}
            <strong>Wompi</strong>. Un pedido se considera confirmado una vez
            registrado en nuestro sistema; en pagos en línea, una vez Wompi
            confirma la transacción aprobada.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">
            3. Envíos
          </h2>
          <p>
            Realizamos envíos a nivel nacional. Los tiempos y costos de envío se
            informan durante el proceso de compra y pueden variar según tu
            ciudad. Ofrecemos domicilios gratuitos en Armenia según las
            condiciones vigentes publicadas en el sitio.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">
            4. Cambios, devoluciones y derecho de retracto
          </h2>
          <p>
            De acuerdo con la Ley 1480 de 2011 (Estatuto del Consumidor), tienes
            derecho de retracto dentro de los 5 días hábiles siguientes a la
            entrega en compras realizadas por medios no tradicionales (como
            nuestro sitio web o WhatsApp), siempre que el producto esté sin usar,
            con sus etiquetas originales y en las mismas condiciones en que lo
            recibiste. Para solicitar un cambio, devolución o ejercer el derecho
            de retracto, contáctanos por correo o WhatsApp (ver sección 8) dentro
            del plazo indicado.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">
            5. Cuentas de usuario
          </h2>
          <p>
            Al registrarte en nuestro sitio eres responsable de mantener la
            confidencialidad de tu contraseña y de toda actividad realizada
            desde tu cuenta. Debes proporcionarnos información veraz y
            actualizada.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">
            6. Comunicaciones por WhatsApp y otros canales
          </h2>
          <p>
            Al escribirnos por WhatsApp o dejarnos tu número de teléfono, aceptas
            recibir mensajes relacionados con tu pedido, atención al cliente y,
            si lo autorizas, promociones de MeryLay Boutique. Puedes dejar de
            recibir mensajes promocionales en cualquier momento indicándolo en la
            conversación. Más detalles en nuestra{" "}
            <a
              href="/politica"
              className="text-brand-rosa underline underline-offset-2"
            >
              Política de Privacidad
            </a>
            .
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">
            7. Propiedad intelectual
          </h2>
          <p>
            El nombre &quot;MeryLay Boutique&quot;, el logo, las fotografías de
            producto y el contenido del sitio son propiedad de MeryLay Boutique
            y no pueden reproducirse ni usarse sin autorización previa.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">
            8. Limitación de responsabilidad
          </h2>
          <p>
            MeryLay Boutique no se hace responsable por retrasos causados por
            transportadoras externas, caso fortuito o fuerza mayor. Nuestra
            responsabilidad frente a cualquier reclamación se limita al valor
            del producto adquirido.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">
            9. Modificaciones
          </h2>
          <p>
            Podemos actualizar estos Términos en cualquier momento. Los cambios
            se publicarán en esta misma página junto con la fecha de la última
            actualización. El uso continuado del sitio implica la aceptación de
            los Términos vigentes.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">
            10. Ley aplicable
          </h2>
          <p>
            Estos Términos se rigen por las leyes de la República de Colombia,
            incluyendo la Ley 1480 de 2011 (Estatuto del Consumidor) y la Ley
            1581 de 2012 de protección de datos personales.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">
            11. Contacto
          </h2>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>
              Correo:{" "}
              <a
                href="mailto:merylay44@gmail.com"
                className="text-brand-rosa underline underline-offset-2"
              >
                merylay44@gmail.com
              </a>
            </li>
            <li>WhatsApp: +57 313 532 8267</li>
            <li>Ubicación: Armenia, Quindío, Colombia</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
