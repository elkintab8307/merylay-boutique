import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarFirmaEvento } from "@/lib/wompi/signature";

const ESTADOS_CANCELADOS = new Set(["DECLINED", "VOIDED", "ERROR"]);

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido." }, { status: 400 });
  }

  const evento = payload as {
    data?: { transaction?: { id?: string; reference?: string; status?: string } };
    signature?: { properties?: string[]; checksum?: string };
    timestamp?: number;
  };

  if (!evento.data || !evento.signature?.properties || !evento.signature.checksum || !evento.timestamp) {
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

  const transaccion = evento.data.transaction;
  if (!transaccion?.reference || !transaccion.status) {
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();

  if (transaccion.status === "APPROVED") {
    const { data: pedido } = await admin
      .from("orders")
      .select("id")
      .eq("order_number", transaccion.reference)
      .maybeSingle();

    if (pedido) {
      await admin.rpc("confirm_order_payment_wompi", {
        p_order_id: pedido.id,
        p_wompi_transaction_id: transaccion.id ?? "",
      });
    }
  } else if (ESTADOS_CANCELADOS.has(transaccion.status)) {
    await admin
      .from("orders")
      .update({ status: "cancelado" })
      .eq("order_number", transaccion.reference)
      .eq("status", "pendiente");
  }

  return NextResponse.json({ ok: true });
}
