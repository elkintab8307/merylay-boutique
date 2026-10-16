import { getSupabase } from "../_shared/db.ts";
import { construirItemsCatalogo, enviarItemsBatch } from "./catalogo-meta.ts";

export async function handleRequest(req: Request): Promise<Response> {
  const secretoEsperado = Deno.env.get("SYNC_CATALOGO_SECRET") ?? "";
  const secretoRecibido = req.headers.get("x-sync-catalogo-secret") ?? "";
  if (!secretoEsperado || secretoRecibido !== secretoEsperado) {
    return new Response("No autorizado.", { status: 401 });
  }

  const supabase = getSupabase();
  const items = await construirItemsCatalogo(supabase);
  const { enviados, errores } = await enviarItemsBatch(items);

  return new Response(JSON.stringify({ total: items.length, enviados, errores }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
