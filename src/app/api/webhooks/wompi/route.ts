import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarFirmaEvento } from "@/lib/wompi/signature";
import { eventoWompiSchema } from "@/lib/wompi/webhook-payload";

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

function coincidePropiedadesEsperadas(properties: string[]): boolean {
  return (
    properties.length === PROPIEDADES_ESPERADAS.length &&
    properties.every((propiedad, indice) => propiedad === PROPIEDADES_ESPERADAS[indice])
  );
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

  const parseo = eventoWompiSchema.safeParse(payload);
  if (!parseo.success) {
    return NextResponse.json({ error: "Evento con formato invalido." }, { status: 400 });
  }
  const evento = parseo.data;

  if (!coincidePropiedadesEsperadas(evento.signature.properties)) {
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
      .select("id, total")
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
