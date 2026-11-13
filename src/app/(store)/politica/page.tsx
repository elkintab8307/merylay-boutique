import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidad — MeryLay Boutique",
  description:
    "Política de privacidad y tratamiento de datos personales de MeryLay Boutique, incluyendo el uso de WhatsApp para atención al cliente.",
};

const ACTUALIZADO = "30 de septiembre de 2026";

export default function PoliticaPrivacidadPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl text-brand-ciruela">
          Política de Privacidad
        </h1>
        <p className="text-sm text-brand-ciruela/70">
          Última actualización: {ACTUALIZADO}
        </p>
      </header>

      <div className="flex flex-col gap-8 text-sm leading-relaxed text-brand-ciruela/90">
        <section className="flex flex-col gap-2">
          <p>
            En <strong>MeryLay Boutique</strong> (&quot;nosotros&quot;) respetamos tu
            privacidad y protegemos tus datos personales conforme a la Ley 1581 de
            2012, el Decreto 1377 de 2013 y demás normas de protección de datos
            personales vigentes en Colombia. Esta política explica qué información
            recopilamos, cómo la usamos, con quién la compartimos y cuáles son tus
            derechos, incluyendo el uso de <strong>WhatsApp</strong> como canal de
            atención y venta.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">
            1. Responsable del tratamiento
          </h2>
          <p>
            MeryLay Boutique, tienda de moda femenina ubicada en Armenia, Quindío,
            Colombia, es la responsable del tratamiento de los datos personales
            recolectados a través de nuestro sitio web (merylay.shop), nuestra
            tienda física y nuestros canales de mensajería, incluido WhatsApp.
          </p>
          <p>
            Contacto:{" "}
            <a
              href="mailto:merylay44@gmail.com"
              className="text-brand-rosa underline underline-offset-2"
            >
              merylay44@gmail.com
            </a>{" "}
            · WhatsApp/Teléfono:{" "}
            <a
              href="https://api.whatsapp.com/send/?phone=573135328267&text&type=phone_number&app_absent=0"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-rosa underline underline-offset-2"
            >
              +57 313 532 8267
            </a>
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">
            2. Datos que recopilamos
          </h2>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>
              <strong>Datos de identificación y contacto:</strong> nombre, número de
              teléfono, correo electrónico y dirección de envío.
            </li>
            <li>
              <strong>Datos de la cuenta:</strong> usuario, historial de pedidos,
              productos favoritos y calificaciones de productos.
            </li>
            <li>
              <strong>Datos de compra:</strong> productos adquiridos, tallas,
              colores, valores, método de pago y estado del pedido.
            </li>
            <li>
              <strong>Comunicaciones por WhatsApp:</strong> número de teléfono y el
              contenido de los mensajes que nos envías para consultar productos,
              hacer pedidos o solicitar soporte.
            </li>
            <li>
              <strong>Datos de navegación:</strong> páginas visitadas, productos
              vistos y datos técnicos del dispositivo/navegador, recogidos con
              fines estadísticos y de publicidad (ver sección 6).
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">
            3. Para qué usamos tus datos
          </h2>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>Procesar y dar seguimiento a tus pedidos y pagos.</li>
            <li>
              Responder tus mensajes de WhatsApp: consultas sobre productos, tallas,
              disponibilidad, estado de pedidos y soporte postventa.
            </li>
            <li>
              Enviarte confirmaciones de pedido, cambios de estado y comunicaciones
              transaccionales por correo electrónico o WhatsApp.
            </li>
            <li>Gestionar tu cuenta, carrito de compras y lista de favoritos.</li>
            <li>
              Enviarte promociones o novedades, únicamente si nos has dado tu
              consentimiento para recibirlas.
            </li>
            <li>Cumplir obligaciones legales, contables y fiscales.</li>
            <li>Prevenir fraude y proteger la seguridad de la tienda.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">
            4. Uso de WhatsApp Business
          </h2>
          <p>
            Usamos WhatsApp (a través de la WhatsApp Business Platform de Meta)
            como canal de atención al cliente y ventas. Cuando nos escribes por
            WhatsApp o inicias una conversación desde un botón de nuestro sitio,
            aceptas que tu número de teléfono y el contenido de la conversación
            sean tratados por MeryLay Boutique para atender tu solicitud.
          </p>
          <p>
            Meta Platforms, Inc. actúa como proveedor de la infraestructura de
            mensajería y procesa los mensajes conforme a su propia{" "}
            <a
              href="https://www.whatsapp.com/legal/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-rosa underline underline-offset-2"
            >
              Política de Privacidad de WhatsApp
            </a>
            . No compartimos tu número de WhatsApp con terceros para fines
            publicitarios ajenos a MeryLay Boutique. Puedes dejar de recibir
            mensajes nuestros en cualquier momento respondiendo &quot;STOP&quot; o
            solicitándolo directamente en la conversación.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">
            5. Con quién compartimos tus datos
          </h2>
          <p>No vendemos tus datos personales. Los compartimos únicamente con:</p>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>
              <strong>Meta / WhatsApp</strong> — para la entrega de mensajes de
              atención al cliente.
            </li>
            <li>
              <strong>Supabase</strong> — proveedor de base de datos y
              autenticación que aloja tu información de forma segura.
            </li>
            <li>
              <strong>Vercel</strong> — proveedor de hospedaje de nuestro sitio web.
            </li>
            <li>
              <strong>Wompi</strong> — pasarela de pagos, para procesar tus compras
              en línea de forma segura.
            </li>
            <li>
              <strong>Resend</strong> — proveedor de envío de correos
              transaccionales (confirmación de pedido, cambios de estado).
            </li>
            <li>
              Autoridades competentes, cuando la ley así lo exija.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">
            6. Cookies y píxeles de seguimiento
          </h2>
          <p>
            Nuestro sitio puede usar el Píxel de Meta (Facebook/Instagram Ads) y el
            Píxel de TikTok Ads para medir el rendimiento de nuestras campañas
            publicitarias y mostrarte anuncios relevantes. Estas herramientas
            recogen datos de navegación de forma anónima o seudonimizada, conforme
            a las políticas de privacidad de Meta y TikTok. Estos píxeles solo se
            cargan en la tienda pública, nunca en los paneles administrativos.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">
            7. Conservación de los datos
          </h2>
          <p>
            Conservamos tus datos mientras tengas una cuenta activa con nosotros o
            mientras sea necesario para cumplir con las finalidades descritas y
            nuestras obligaciones legales (por ejemplo, contables y tributarias).
            Las conversaciones de WhatsApp se conservan el tiempo necesario para
            resolver tu solicitud y por motivos de soporte e historial de compra.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">
            8. Tus derechos (Habeas Data)
          </h2>
          <p>
            Como titular de tus datos personales, tienes derecho a conocer,
            actualizar, rectificar y solicitar la eliminación de tu información, así
            como a revocar la autorización otorgada para su tratamiento, en
            cualquier momento. Para ejercer estos derechos, escríbenos a{" "}
            <a
              href="mailto:merylay44@gmail.com"
              className="text-brand-rosa underline underline-offset-2"
            >
              merylay44@gmail.com
            </a>{" "}
            o por WhatsApp al +57 313 532 8267, indicando tu solicitud. Responderemos
            dentro de los plazos establecidos por la ley colombiana.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">
            9. Menores de edad
          </h2>
          <p>
            Nuestros productos y servicios están dirigidos a personas mayores de
            edad. No recopilamos intencionalmente datos personales de menores de
            edad sin el consentimiento de sus padres o representantes legales.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">
            10. Seguridad de la información
          </h2>
          <p>
            Aplicamos medidas técnicas y organizativas razonables (cifrado en
            tránsito, control de acceso por roles y autenticación segura) para
            proteger tus datos personales contra pérdida, uso indebido o acceso no
            autorizado.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">
            11. Cambios a esta política
          </h2>
          <p>
            Podemos actualizar esta política de privacidad periódicamente. Los
            cambios se publicarán en esta misma página junto con la fecha de la
            última actualización.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">
            12. Contacto
          </h2>
          <p>
            Si tienes preguntas sobre esta política o sobre el tratamiento de tus
            datos personales, contáctanos:
          </p>
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
