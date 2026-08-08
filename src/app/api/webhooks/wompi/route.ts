import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarFirmaEvento } from "@/lib/wompi/signature";
import { eventoWompiSchema } from "@/lib/wompi/webhook-payload";

const ESTADOS_CANCELADOS = new Set(["DECLINED", "VOIDED", "ERROR"]);

// Lista fija de propiedades que Wompi firma para este tipo de evento
// (transaction.updated). No se toma del cuerpo de la peticion: si se
// confiara en `signature.properties` tal como llega, quien controla el
// cuerpo tambien controlaria que campos cubre el checksum, permitiendo
// alterar `reference` (que ni siquiera esta en esta lista) sin invalidar
// la firma. Referencia: docs/superpowers/plans/2026-08-07-fase-11-2-pago-wompi.md
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
    process.env.WOMPI_EVENTS_SECRET!,
  );

  if (!firmaValida) {
    return NextResponse.json({ error: "Firma invalida." }, { status: 401 });
  }

  const ahoraSegundos = Date.now() / 1000;
  if (Math.abs(ahoraSegundos - evento.timestamp) > VENTANA_REPLAY_SEGUNDOS) {
    return NextResponse.json({ error: "Evento expirado." }, { status: 400 });
  }

  const transaccion = evento.data.transaction;
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
