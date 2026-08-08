import { createElement } from "react";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarFirmaEvento } from "@/lib/wompi/signature";
import { eventoWompiSchema } from "@/lib/wompi/webhook-payload";
import { enviarCorreo } from "@/lib/email/resend";
import { ConfirmacionPedidoEmail } from "@/lib/email/templates/confirmacion-pedido-email";

const ESTADOS_CANCELADOS = new Set(["DECLINED", "VOIDED", "ERROR"]);

// Lista fija de propiedades que Wompi firma para este tipo de evento
// (transaction.updated). No se toma del cuerpo de la peticion: si se
// confiara en `signature.properties` tal como llega, quien controla el
// cuerpo tambien controlaria que valores se concatenan (sin separador, ver
// `obtenerValorPorRuta`) para calcular el checksum, lo que permitiria
// sustituir unos valores firmados por otros sin invalidar la firma. OJO:
// esto NO ata `reference` a la firma — `reference` nunca formo parte del
// conjunto que Wompi firma, con o sin este pin. Lo que realmente acota el
// riesgo de reapuntar un evento valido a otro pedido es la combinacion de
// la verificacion de monto (Important 3), la ventana de 5 minutos de abajo
// y el scoping por `payment_method`/`status='pendiente'` en las consultas.
// Referencia: docs/superpowers/plans/2026-08-07-fase-11-2-pago-wompi.md
const PROPIEDADES_ESPERADAS = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];

// Ventana de tolerancia para el timestamp del evento: acota el tiempo
// durante el cual un evento valido capturado podria ser reenviado.
const VENTANA_REPLAY_SEGUNDOS = 300;

// Unico tipo de evento que este manejador sabe procesar. Wompi entrega otros
// tipos (nequi_token.updated, etc.) a la misma URL: su `data` tiene otra forma
// y no validaria contra `eventoWompiSchema`, asi que sin este filtro se
// registrarian como "formato invalido" (ruido) y se responderia 400,
// induciendo reintentos de algo que jamas vamos a procesar.
const EVENTO_SOPORTADO = "transaction.updated";

// Tope al tamano del cuerpo que se vuelca en el log de un evento que no
// valida: alcanza para diagnosticar sin llenar los logs con payloads enteros.
const MAX_CARACTERES_CUERPO_LOG = 300;

function coincidePropiedadesEsperadas(properties: string[]): boolean {
  return (
    properties.length === PROPIEDADES_ESPERADAS.length &&
    properties.every((propiedad, indice) => propiedad === PROPIEDADES_ESPERADAS[indice])
  );
}

function resumirCuerpo(payload: unknown): string {
  try {
    return JSON.stringify(payload).slice(0, MAX_CARACTERES_CUERPO_LOG);
  } catch {
    return "<cuerpo no serializable>";
  }
}

export async function POST(request: NextRequest) {
  // Fail-closed: si el secreto no esta configurado, `process.env...` seria
  // `undefined` y se interpolaria como el string literal "undefined" en el
  // hash de `verificarFirmaEvento`, convirtiendo el "secreto" en un valor
  // publicamente adivinable -- cualquiera podria calcular un checksum valido
  // y forjar eventos APPROVED. Se corta aqui, antes de tocar el cuerpo o la
  // firma, para que una configuracion faltante rechace todo (ruidoso,
  // diagnosticable, seguro) en vez de aceptar en silencio pagos forjados.
  const secretoEventos = process.env.WOMPI_EVENTS_SECRET;
  if (!secretoEventos) {
    console.error(
      "[webhook wompi] WOMPI_EVENTS_SECRET no esta configurado — rechazando todos los eventos del webhook.",
    );
    return NextResponse.json({ error: "Configuracion del servidor invalida." }, { status: 500 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido." }, { status: 400 });
  }

  // Se descartan los tipos de evento que no procesamos ANTES de validar el
  // esquema, y con 200 (no 400): no son payloads malformados, simplemente no
  // nos incumben. Solo se filtra cuando `event` viene y es un string distinto;
  // un cuerpo sin `event` sigue su curso para que el esquema lo rechace.
  const tipoEvento = (payload as { event?: unknown } | null)?.event;
  if (typeof tipoEvento === "string" && tipoEvento !== EVENTO_SOPORTADO) {
    return NextResponse.json({ ok: true });
  }

  const parseo = eventoWompiSchema.safeParse(payload);
  if (!parseo.success) {
    // Se registra: un rechazo silencioso y permanente es invisible hasta que
    // un cliente reclama que pago y su pedido sigue pendiente. Aqui no hay
    // `reference` confiable que reportar (puede que ni exista `data.transaction`),
    // asi que se deja la traza que si se puede: los campos que fallaron y un
    // extracto acotado del cuerpo.
    console.error(
      `[webhook wompi] Evento con formato invalido (rechazado con 400). Campos invalidos: ${parseo.error.issues
        .map((issue) => issue.path.join(".") || "(raiz)")
        .join(", ")}. Cuerpo (truncado):`,
      resumirCuerpo(payload),
    );
    return NextResponse.json({ error: "Evento con formato invalido." }, { status: 400 });
  }
  const evento = parseo.data;

  if (!coincidePropiedadesEsperadas(evento.signature.properties)) {
    // OJO: la referencia proviene de un cuerpo cuya firma todavia NO se
    // verifico; se registra solo como pista de diagnostico, no como un hecho.
    console.error(
      `[webhook wompi] signature.properties no coincide con la lista fijada para la referencia ${evento.data.transaction.reference} (transaccion ${evento.data.transaction.id}): recibido [${evento.signature.properties.join(", ")}], esperado [${PROPIEDADES_ESPERADAS.join(", ")}].`,
    );
    return NextResponse.json({ error: "Evento con formato invalido." }, { status: 400 });
  }

  const firmaValida = verificarFirmaEvento(
    {
      data: evento.data,
      signature: {
        properties: evento.signature.properties,
        checksum: evento.signature.checksum,
      },
      timestamp: evento.timestamp,
    },
    secretoEventos,
  );

  if (!firmaValida) {
    // Igual que arriba: la referencia sale de un cuerpo no autenticado y solo
    // sirve como pista. Se registra porque un secreto mal rotado en Vercel
    // rechazaria TODOS los pagos y, sin esta traza, el sintoma seria
    // indistinguible de "Wompi no nos esta llamando".
    console.error(
      `[webhook wompi] Checksum invalido para la referencia ${evento.data.transaction.reference} (transaccion ${evento.data.transaction.id}) — evento rechazado con 401.`,
    );
    return NextResponse.json({ error: "Firma invalida." }, { status: 401 });
  }

  const transaccion = evento.data.transaction;

  const ahoraSegundos = Date.now() / 1000;
  const antiguedadSegundos = Math.abs(ahoraSegundos - evento.timestamp);
  if (antiguedadSegundos > VENTANA_REPLAY_SEGUNDOS) {
    // 200, no 400: un timestamp expirado nunca deja de estarlo en un
    // reintento (Wompi reenvia el mismo payload original, con el mismo
    // timestamp), asi que devolver un codigo que induce reintento aqui
    // solo generaria un loop de reintentos permanente e inutil. Se registra
    // para poder reconciliar manualmente un evento que llego tarde por algo
    // mundano (downtime en un deploy, cola de entrega atrasada, etc.).
    console.error(
      `[webhook wompi] Evento fuera de la ventana de tolerancia para el pedido ${transaccion.reference} (transaccion ${transaccion.id}): antiguedad de ${Math.round(antiguedadSegundos)}s (limite ${VENTANA_REPLAY_SEGUNDOS}s).`,
    );
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();

  if (transaccion.status === "APPROVED") {
    const { data: pedido, error: errorBusqueda } = await admin
      .from("orders")
      .select("id, total, status")
      .eq("order_number", transaccion.reference)
      .eq("payment_method", "wompi")
      .maybeSingle();

    if (errorBusqueda) {
      console.error(
        `[webhook wompi] Error buscando el pedido ${transaccion.reference} (transaccion ${transaccion.id}):`,
        errorBusqueda,
      );
      return NextResponse.json({ ok: true });
    }

    if (!pedido) {
      console.error(
        `[webhook wompi] Evento APPROVED sin pedido Wompi correspondiente para la referencia ${transaccion.reference} (transaccion ${transaccion.id}).`,
      );
      return NextResponse.json({ ok: true });
    }

    const montoEsperadoCentavos = Math.round(Number(pedido.total) * 100);
    if (montoEsperadoCentavos !== transaccion.amount_in_cents) {
      console.error(
        `[webhook wompi] Monto no coincide para el pedido ${transaccion.reference} (transaccion ${transaccion.id}): esperado ${montoEsperadoCentavos}, recibido ${transaccion.amount_in_cents}.`,
      );
      return NextResponse.json({ ok: true });
    }

    const { error: errorRpc } = await admin.rpc("confirm_order_payment_wompi", {
      p_order_id: pedido.id,
      p_wompi_transaction_id: transaccion.id,
    });

    if (errorRpc) {
      console.error(
        `[webhook wompi] Error confirmando el pago del pedido ${transaccion.reference} (transaccion ${transaccion.id}):`,
        errorRpc,
      );
    }

    // Solo se notifica si ESTA llamada fue la que en verdad transiciono el
    // pedido a pagado (pre-RPC ya estaba 'pendiente'). La RPC es idempotente
    // -- si Wompi reenvia el mismo evento APPROVED dentro de la ventana de
    // replay (o luego de un reintento de red), `errorRpc` sigue ausente pero
    // el pedido ya estaba 'pagado' antes de esta llamada; sin este chequeo
    // se le enviaria al cliente un segundo correo de confirmacion duplicado.
    if (!errorRpc && pedido.status === "pendiente") {
      // Todo el bloque del correo va dentro de un try/catch: el pago YA quedo
      // confirmado en la base de datos. Si algo aqui lanzara (supabase-js puede
      // lanzar ante fallos inesperados, no solo devolver `{error}`), este
      // manejador respondiria 500 y Wompi reintentaria un evento que en
      // realidad ya se proceso con exito. Un correo que no sale nunca puede
      // costar mas que eso.
      // Nota: la plantilla se pasa con `createElement` en vez de invocarla como
      // funcion — asi su cuerpo se ejecuta dentro del render de Resend (ya
      // cubierto por el try/catch de `enviarCorreo`) y no aqui, de forma ansiosa.
      try {
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
              react: createElement(ConfirmacionPedidoEmail, {
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
                // Este correo solo se dispara tras un APPROVED que en verdad
                // transiciono el pedido a pagado, asi que "confirmado" es cierto.
                variante: "pagado",
              }),
            });
          }
        }
      } catch (emailError) {
        console.error(
          `[email] Error preparando o enviando el correo de confirmación del pedido ${transaccion.reference} (transaccion ${transaccion.id}):`,
          emailError,
        );
      }
    }
  } else if (ESTADOS_CANCELADOS.has(transaccion.status)) {
    const { error: errorUpdate } = await admin
      .from("orders")
      .update({ status: "cancelado" })
      .eq("order_number", transaccion.reference)
      .eq("payment_method", "wompi")
      .eq("status", "pendiente");

    if (errorUpdate) {
      console.error(
        `[webhook wompi] Error cancelando el pedido ${transaccion.reference} (transaccion ${transaccion.id}):`,
        errorUpdate,
      );
    }
  }

  return NextResponse.json({ ok: true });
}
