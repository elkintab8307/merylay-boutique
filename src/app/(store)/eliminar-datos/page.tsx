import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Eliminación de Datos de Usuario — MeryLay Boutique",
  description:
    "Instrucciones para solicitar la eliminación de tus datos personales y conversaciones de WhatsApp en MeryLay Boutique.",
};

export default function EliminarDatosPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl text-brand-ciruela">
          Eliminación de Datos de Usuario
        </h1>
        <p className="text-sm text-brand-ciruela/70">
          Cómo solicitar la eliminación de tus datos personales en MeryLay
          Boutique.
        </p>
      </header>

      <div className="flex flex-col gap-8 text-sm leading-relaxed text-brand-ciruela/90">
        <section className="flex flex-col gap-2">
          <p>
            En <strong>MeryLay Boutique</strong> respetamos tu derecho a decidir
            qué pasa con tus datos personales. Si deseas que eliminemos la
            información que tenemos sobre ti —incluyendo tu cuenta, historial de
            pedidos y las conversaciones que hayas tenido con nosotros por{" "}
            <strong>WhatsApp</strong>— puedes solicitarlo en cualquier momento
            siguiendo los pasos de esta página.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">
            Cómo solicitar la eliminación
          </h2>
          <p>Envíanos tu solicitud por cualquiera de estos medios, indicando:</p>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>Tu nombre completo.</li>
            <li>
              El correo electrónico o número de teléfono/WhatsApp con el que
              interactúas con nosotros.
            </li>
            <li>Que solicitas la eliminación de tus datos personales.</li>
          </ul>
          <ul className="list-disc pl-5 flex flex-col gap-1 pt-2">
            <li>
              Correo:{" "}
              <a
                href="mailto:merylay44@gmail.com?subject=Solicitud%20de%20eliminaci%C3%B3n%20de%20datos"
                className="text-brand-rosa underline underline-offset-2"
              >
                merylay44@gmail.com
              </a>
            </li>
            <li>
              WhatsApp:{" "}
              <a
                href="https://api.whatsapp.com/send/?phone=573135328267&text=Solicito%20la%20eliminaci%C3%B3n%20de%20mis%20datos%20personales&type=phone_number&app_absent=0"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-rosa underline underline-offset-2"
              >
                +57 313 532 8267
              </a>
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">
            Qué eliminamos
          </h2>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>
              Tu cuenta y perfil (nombre, correo, teléfono, direcciones
              guardadas).
            </li>
            <li>Tus productos favoritos y calificaciones.</li>
            <li>
              Las conversaciones de WhatsApp asociadas a tu número de teléfono.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">
            Qué conservamos y por qué
          </h2>
          <p>
            Por obligación legal, contable y tributaria, debemos conservar los
            registros de pedidos y facturación (datos de la transacción, no tu
            cuenta de usuario) durante el tiempo que exige la ley colombiana,
            aun después de eliminar tu cuenta. Estos registros se conservan
            únicamente con fines legales y no se usan para ningún otro
            propósito.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">
            Tiempo de respuesta
          </h2>
          <p>
            Procesaremos tu solicitud y confirmaremos la eliminación de tus
            datos dentro de los plazos establecidos por la Ley 1581 de 2012 de
            protección de datos personales en Colombia (hasta 15 días hábiles,
            prorrogables en casos excepcionales con previo aviso).
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl text-brand-ciruela">Contacto</h2>
          <p>
            Para más información, consulta nuestra{" "}
            <a
              href="/politica"
              className="text-brand-rosa underline underline-offset-2"
            >
              Política de Privacidad
            </a>{" "}
            o escríbenos a{" "}
            <a
              href="mailto:merylay44@gmail.com"
              className="text-brand-rosa underline underline-offset-2"
            >
              merylay44@gmail.com
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
