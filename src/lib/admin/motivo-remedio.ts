/**
 * Traduce el motivo tecnico de un fallo de subida de imagen (mensaje de
 * Supabase Storage, error de red del navegador, etc.) a un texto claro
 * para la duena de la tienda: que paso y que debe hacer para que la
 * imagen suba. Se usa en el formulario de producto, debajo de cada
 * variante con imagenes fallidas.
 */

export type Remedio = { causa: string; queHacer: string };

export function motivoARemedio(
  motivo: string,
  opciones: { sePasoASegundoPlano?: boolean } = {},
): Remedio {
  // Se detecto en el momento (no se infiere del texto del error) que la
  // pestana se oculto mientras se subia esta imagen -- diagnostico mas
  // preciso que el generico de conexion, aunque el navegador reporte un
  // mensaje que tambien calzaria con esa otra categoria.
  if (opciones.sePasoASegundoPlano) {
    return {
      causa: "La pantalla se bloqueó o cambiaste de app mientras se subía la imagen.",
      queHacer:
        "No cambies de app ni bloquees el celular mientras guardas: mantén esta pestaña abierta y visible, y vuelve a pulsar «Guardar».",
    };
  }

  const m = motivo.toLowerCase();

  if (/failed to fetch|networkerror|network error|load failed|conexión|conexion|timeout|timed out/.test(m)) {
    return {
      causa: "Se interrumpió la conexión mientras se subía la imagen.",
      queHacer:
        "Revisa que tengas buena señal y vuelve a pulsar «Guardar». Si estás en datos móviles, prueba con wifi.",
    };
  }

  if (/exceeded the maximum|maximum allowed size|too large|payload too large|413|entity too large/.test(m)) {
    return {
      causa: "El servidor rechazó la imagen por su tamaño.",
      queHacer:
        "Usa una imagen más liviana: una foto normal en vez de una captura de pantalla, o recórtala antes de subirla.",
    };
  }

  if (/procesar|memoria|memory|decode|canvas|no se pudo preparar/.test(m)) {
    return {
      causa:
        "El teléfono no pudo preparar la imagen (suele ser falta de memoria con fotos muy grandes).",
      queHacer:
        "Sube esta imagen sola o de a pocas, cierra otras apps abiertas, o usa una foto normal en vez de una captura de pantalla.",
    };
  }

  if (/row-level security|violates row|permission|not authorized|unauthorized|jwt|403|401|token/.test(m)) {
    return {
      causa: "Tu sesión no tiene permiso para subir imágenes o ya expiró.",
      queHacer: "Cierra sesión, vuelve a entrar y reintenta la subida.",
    };
  }

  return {
    causa: `No se pudo subir (${motivo}).`,
    queHacer:
      "Vuelve a pulsar «Guardar» para reintentar. Si sigue fallando, intenta con esa imagen sola.",
  };
}
