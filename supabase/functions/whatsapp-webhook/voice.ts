import { obtenerUrlMedia, descargarMedia } from "../_shared/meta.ts";

export async function transcribirAudio(mediaId: string): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("Falta OPENAI_API_KEY.");
  }

  const url = await obtenerUrlMedia(mediaId);
  const bytes = await descargarMedia(url);

  const formulario = new FormData();
  formulario.append("file", new Blob([bytes]), "audio.ogg");
  formulario.append("model", "whisper-1");

  const respuesta = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formulario,
  });

  if (!respuesta.ok) {
    throw new Error(`OpenAI respondio ${respuesta.status} al transcribir el audio.`);
  }

  const cuerpo = await respuesta.json();
  return (cuerpo.text as string) ?? "";
}
