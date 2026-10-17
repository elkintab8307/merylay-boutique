import { getSupabase } from "../_shared/db.ts";

export interface RecuerdoCliente {
  categoria: string;
  clave: string;
  valor: string;
  origen: string;
}

export interface HechoMemoria {
  categoria: string;
  clave: string;
  valor: string;
}

// Vocabulario cerrado para categoria 'preferencia'/'contacto': evita que el
// modelo invente tres nombres distintos ("talla", "talla_preferida", "size")
// para el mismo hecho. "resumen_conversacion" es la unica clave valida para
// categoria 'resumen'. agent.ts reutiliza esta misma lista para documentarle
// el vocabulario al modelo, en vez de mantener dos copias.
export const CLAVES_VALIDAS: readonly string[] = [
  "nombre_completo",
  "ciudad_habitual",
  "direccion_habitual",
  "metodo_pago_preferido",
  "talla_preferida",
  "color_favorito",
  "estilo_preferido",
  "ocasion_tipica",
  "resumen_conversacion",
];

const CATEGORIAS_MEMORIA_LLM = new Set(["preferencia", "contacto", "resumen"]);

// Los mas recientes primero: si en el futuro hay que recortar (ej. una
// cuenta con años de hechos acumulados), lo mas reciente es lo mas
// relevante para la conversacion de hoy.
export async function cargarMemoria(profileId: string): Promise<RecuerdoCliente[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("customer_memory")
    .select("categoria, clave, valor, origen")
    .eq("customer_id", profileId)
    .order("updated_at", { ascending: false });

  if (error || !data) {
    console.error(`[memory] No se pudo cargar la memoria de ${profileId}:`, error);
    return [];
  }
  return data as RecuerdoCliente[];
}

// Memoria extraida por el modelo: es contexto best-effort, nunca debe
// bloquear la respuesta a la clienta. Un hecho con una clave fuera del
// vocabulario, o con un valor vacio, se descarta en silencio en vez de
// corromper la memoria con un dato que el prompt nunca vuelve a leer
// correctamente (clave desconocida) o que se mostraria como si ya se
// hubiera preguntado algo que en realidad no se sabe (valor vacio).
export async function guardarMemoria(profileId: string, hechos: HechoMemoria[]): Promise<void> {
  const validos = hechos.filter(
    (h) => CATEGORIAS_MEMORIA_LLM.has(h.categoria) && CLAVES_VALIDAS.includes(h.clave) && h.valor.trim().length > 0,
  );
  if (validos.length === 0) return;

  const supabase = getSupabase();
  const ahora = new Date().toISOString();
  const filas = validos.map((h) => ({
    customer_id: profileId,
    categoria: h.categoria,
    clave: h.clave,
    valor: h.valor.trim(),
    origen: "bot",
    updated_at: ahora,
  }));

  const { error } = await supabase.from("customer_memory").upsert(filas, { onConflict: "customer_id,clave" });
  if (error) {
    console.error(`[memory] No se pudo guardar memoria de ${profileId}:`, error);
  }
}

// A diferencia de guardarMemoria: esto lo dispara una accion explicita de
// la dueña (agregar_nota_cliente), con una confirmacion que le llega por
// WhatsApp -- si la insercion falla, debe lanzar para que esa confirmacion
// no mienta diciendo "listo" cuando en realidad no se guardo nada.
export async function guardarNota(profileId: string, nota: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("customer_memory").insert({
    customer_id: profileId,
    categoria: "nota",
    clave: `nota_${Date.now()}`,
    valor: nota,
    origen: "dueño",
  });

  if (error) {
    throw new Error(`No se pudo guardar la nota: ${error.message}`);
  }
}
