"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { estadoPedidoSchema } from "@/lib/validation/pedido";
import { debeNotificarCambioEstado } from "@/lib/email/notificaciones";
import { enviarCorreo } from "@/lib/email/resend";
import { CambioEstadoEmail } from "@/lib/email/templates/cambio-estado-email";

export async function cambiarEstadoPedido(
  orderId: string,
  nuevoEstado: string,
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = estadoPedidoSchema.safeParse(nuevoEstado);
  if (!parsed.success) {
    return { error: "Estado inválido." };
  }

  const supabase = await createClient();

  // Se lee el estado ANTES de aplicar el update: si ya estaba en `parsed.data`
  // (re-aplicar el mismo estado, p. ej. un doble clic), no es una transicion
  // real y no debe disparar un segundo correo. Mismo criterio que
  // `route.ts` del webhook de Wompi con `pedido.status === "pendiente"`.
  const { data: pedidoAntes } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .single();

  const { error } = await supabase
    .from("orders")
    .update({ status: parsed.data })
    .eq("id", orderId);

  if (error) {
    return { error: "No se pudo actualizar el pedido." };
  }

  const huboTransicionReal = pedidoAntes?.status !== parsed.data;

  if (huboTransicionReal && debeNotificarCambioEstado(parsed.data)) {
    const admin = createAdminClient();
    const { data: pedido } = await admin
      .from("orders")
      .select("id, order_number, user_id")
      .eq("id", orderId)
      .single();

    if (pedido) {
      const { data: usuario, error: errorUsuario } = await admin.auth.admin.getUserById(
        pedido.user_id,
      );
      if (errorUsuario) {
        console.error(
          `[admin pedidos] Error obteniendo el email del usuario ${pedido.user_id} para el pedido ${pedido.order_number}:`,
          errorUsuario,
        );
      }
      if (usuario.user?.email) {
        await enviarCorreo({
          to: usuario.user.email,
          subject: `Actualización de tu pedido ${pedido.order_number}`,
          react: CambioEstadoEmail({
            orderNumber: pedido.order_number,
            orderId: pedido.id,
            nuevoEstado: parsed.data,
          }),
        });
      }
    }
  }

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  return {};
}
