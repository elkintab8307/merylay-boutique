import QRCode from "qrcode";
import bwipjs from "bwip-js/node";

export async function generarCodigoQr(texto: string): Promise<string> {
  return QRCode.toDataURL(texto);
}

export async function generarCodigoBarras(texto: string): Promise<string> {
  const png = await bwipjs.toBuffer({
    bcid: "code128",
    text: texto,
    scale: 3,
    height: 10,
    includetext: true,
    textxalign: "center",
  });
  return `data:image/png;base64,${png.toString("base64")}`;
}
