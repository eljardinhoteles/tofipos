// Nombre que el usuario le da a este equipo («Barra», «Caja», «Tablet joely»). Viaja en la cabecera X-Client-Info de cada petición a
// Supabase (esa cabecera ya la envía supabase-js, así que el CORS la permite; una cabecera nueva haría fallar toda petición).
// La auditoría de escrituras lo lee para saber desde qué equipo llegó cada cambio.
const CLAVE = 'pos_device_name';

/** Solo letras, números y signos simples: viaja en una cabecera HTTP. */
export function limpiarNombreDispositivo(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 _.-]/g, '').trim().slice(0, 40);
}

export function leerNombreDispositivo(): string {
  try { return limpiarNombreDispositivo(localStorage.getItem(CLAVE) || ''); } catch { return ''; }
}

export function guardarNombreDispositivo(texto: string) {
  try {
    const limpio = limpiarNombreDispositivo(texto);
    if (limpio) localStorage.setItem(CLAVE, limpio); else localStorage.removeItem(CLAVE);
  } catch { /* sin almacenamiento */ }
}

/** Valor de X-Client-Info: conserva el prefijo de supabase-js y añade el nombre si existe. */
export function cabeceraClientInfo(): string {
  const nombre = leerNombreDispositivo();
  return nombre ? `supabase-js-web; dispositivo=${nombre}` : 'supabase-js-web';
}
