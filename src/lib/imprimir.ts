import { showToast, motivoDeError } from './toast';

// Envío a imprimir con aviso REAL del resultado: "Enviado" solo si el servidor lo
// aceptó, y un error visible (con "Reintentar") si no. Antes los fallos solo iban
// a la consola y el mesero creía que el ticket había salido.

const DURACION_ERROR_MS = 15_000;

// Un fallo de red al imprimir es del servidor de impresión, no de internet en general.
function motivoImpresion(err: unknown) {
  const crudo = err instanceof Error ? err.message : '';
  return /failed to fetch|networkerror|network request failed|load failed/i.test(crudo)
    ? 'Servidor de impresión sin conexión.'
    : motivoDeError(err);
}

export async function imprimirConAviso(enviar: () => Promise<unknown>, que: string): Promise<boolean> {
  // Un solo aviso que cambia de "Enviando…" a "Enviado" o al error (mismo id).
  const id = showToast.loading('Enviando a impresora…', que);
  try {
    await enviar();
    showToast.success('Enviado a impresora', que, { id, duracion: 2500 });
    return true;
  } catch (err) {
    console.error(`[No se imprimió: ${que}]`, err);
    showToast.error('No se imprimió', `${que}. ${motivoImpresion(err) ?? ''}`.trim(), {
      id,
      duracion: DURACION_ERROR_MS,
      accion: { etiqueta: 'Reintentar', onClick: () => { void imprimirConAviso(enviar, que); } },
    });
    return false;
  }
}

/** Aviso cuando un ticket que debía salir no se mandó (p. ej. se cerró la vista previa). */
/** `imprimir` ya muestra su propio resultado (usa imprimirConAviso), aquí solo se dispara. */
export function avisarSinImprimir(que: string, imprimir: () => void) {
  showToast.warning('No se imprimió', `${que}: se cerró la vista previa sin enviarla.`, {
    duracion: DURACION_ERROR_MS,
    accion: { etiqueta: 'Imprimir', onClick: () => imprimir() },
  });
}
