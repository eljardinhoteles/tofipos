import { toast } from 'sonner';

// Envío a imprimir con aviso REAL del resultado: "Enviado" solo si el servidor lo
// aceptó, y un error visible (con "Reintentar") si no. Antes los fallos solo iban
// a la consola y el mesero creía que el ticket había salido.

const DURACION_ERROR_MS = 15_000;

export async function imprimirConAviso(enviar: () => Promise<unknown>, que: string): Promise<boolean> {
  // Un solo aviso que cambia de "Enviando…" a "Enviado" o al error (mismo id).
  const id = toast.loading('Enviando a impresora…', { description: que });
  try {
    await enviar();
    toast.success('Enviado a impresora', { id, description: que, duration: 2500 });
    setTimeout(() => toast.dismiss(id), 3100);
    return true;
  } catch (err) {
    const motivo = err instanceof Error ? err.message : 'Error desconocido';
    toast.error(`No se imprimió: ${que}`, {
      id,
      description: motivo,
      duration: DURACION_ERROR_MS,
      action: { label: 'Reintentar', onClick: () => { void imprimirConAviso(enviar, que); } },
    });
    // Mismo respaldo que showToast: en móvil sonner a veces no reanuda el temporizador.
    setTimeout(() => toast.dismiss(id), DURACION_ERROR_MS + 600);
    return false;
  }
}

/** Aviso cuando un ticket que debía salir no se mandó (p. ej. se cerró la vista previa). */
/** `imprimir` ya muestra su propio resultado (usa imprimirConAviso), aquí solo se dispara. */
export function avisarSinImprimir(que: string, imprimir: () => void) {
  const id = toast.warning(`${que} no se imprimió`, {
    description: 'Se cerró la vista previa sin enviarla a la impresora.',
    duration: DURACION_ERROR_MS,
    action: { label: 'Imprimir', onClick: () => imprimir() },
  });
  setTimeout(() => toast.dismiss(id), DURACION_ERROR_MS + 600);
}
