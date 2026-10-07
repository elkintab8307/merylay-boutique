import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  obtenerUrlMedia: vi.fn(),
  descargarMedia: vi.fn(),
}));
vi.mock("../_shared/meta.ts", () => ({
  obtenerUrlMedia: mocks.obtenerUrlMedia,
  descargarMedia: mocks.descargarMedia,
}));

describe("transcribirAudio", () => {
  beforeEach(() => {
    vi.stubGlobal("Deno", { env: { get: vi.fn((k: string) => (k === "OPENAI_API_KEY" ? "clave-de-prueba" : undefined)) } });
    mocks.obtenerUrlMedia.mockResolvedValue("https://graph.facebook.com/audio-real.ogg");
    mocks.descargarMedia.mockResolvedValue(new Uint8Array([1, 2, 3]));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("descarga el audio y devuelve el texto transcrito por OpenAI", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ text: "cuántas camisetas hay" }), { status: 200 })));
    const { transcribirAudio } = await import("./voice.ts");

    const texto = await transcribirAudio("media-123");

    expect(texto).toBe("cuántas camisetas hay");
    expect(mocks.obtenerUrlMedia).toHaveBeenCalledWith("media-123");
    expect(mocks.descargarMedia).toHaveBeenCalledWith("https://graph.facebook.com/audio-real.ogg");
  });

  it("lanza un error descriptivo si OpenAI responde con error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("clave invalida", { status: 401 })));
    const { transcribirAudio } = await import("./voice.ts");
    await expect(transcribirAudio("media-123")).rejects.toThrow(/401/);
  });

  it("lanza un error claro si falta OPENAI_API_KEY", async () => {
    vi.stubGlobal("Deno", { env: { get: vi.fn(() => undefined) } });
    const { transcribirAudio } = await import("./voice.ts");
    await expect(transcribirAudio("media-123")).rejects.toThrow(/OPENAI_API_KEY/);
  });
});
