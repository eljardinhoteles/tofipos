import { toast } from "sonner";

// Sonner pausa el temporizador de cada toast con hover/toque o con la página
// oculta, y en móvil (drawers, toques sin pointerup) a veces nunca lo reanuda:
// el toast queda congelado. Se agenda un cierre forzado propio como respaldo.
// En móvil los toast duran menos (ver ui/sonner.tsx).
const esMovil = () => typeof window !== "undefined" && window.matchMedia("(max-width: 48em)").matches;
const duracion = (error = false) => (esMovil() ? 2200 : error ? 6000 : 4000);

function conCierreForzado(
  fn: typeof toast.success,
  title: string,
  description?: string,
  error = false,
) {
  const duration = duracion(error);
  const id = fn(title, { description, duration });
  setTimeout(() => toast.dismiss(id), duration + 600);
  return id;
}

export const showToast = {
  success: (title: string, description?: string) => {
    conCierreForzado(toast.success, title, description);
  },
  error: (title: string, description?: string) => {
    conCierreForzado(toast.error, title, description, true);
  },
  info: (title: string, description?: string) => {
    conCierreForzado(toast.info, title, description);
  },
  warning: (title: string, description?: string) => {
    conCierreForzado(toast.warning, title, description, true);
  },
  promise: <T>(
    promise: Promise<T>,
    data: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: any) => string);
    }
  ) => {
    return toast.promise(promise, data);
  }
};
