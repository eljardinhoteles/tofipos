import { toast } from "sonner";

// Avisos de toda la app. Única puerta de entrada: nadie importa `sonner` directo (ver ui/sonner.tsx para el aspecto).
//
// Reglas de contenido (para que todos los avisos se lean igual):
//   · success  → lo que se hizo, en una frase corta: «Pago registrado».
//   · error    → algo falló en el sistema: título «No se pudo …» y, debajo, el motivo en palabras llanas (usar `fallo`).
//   · warning  → falta algo o no se puede hacer: validaciones y bloqueos. «Falta el monto», «No se puede anular».
//   · info     → neutro: «Sin conexión», «Disponible en la versión de escritorio».
//   Nunca un título genérico como «Error» o «Aviso»: el título dice qué pasó y la descripción, por qué o qué hacer.

// Sonner pausa el temporizador de cada toast con hover/toque o con la página
// oculta, y en móvil (drawers, toques sin pointerup) a veces nunca lo reanuda:
// el toast queda congelado. Se agenda un cierre forzado propio como respaldo.
type Tipo = "success" | "error" | "warning" | "info";

const esMovil = () => typeof window !== "undefined" && window.matchMedia("(max-width: 48em)").matches;

// Los éxitos y la info se van rápido; los avisos y errores se quedan más (y llevan botón de cerrar).
const DURACION_MS: Record<Tipo, { escritorio: number; movil: number }> = {
  success: { escritorio: 3500, movil: 2200 },
  info: { escritorio: 4500, movil: 3000 },
  warning: { escritorio: 6500, movil: 4500 },
  error: { escritorio: 8000, movil: 5000 },
};
const duracionDe = (tipo: Tipo) => DURACION_MS[tipo][esMovil() ? "movil" : "escritorio"];

export interface OpcionesToast {
  /** Mismo id = el aviso se actualiza en lugar de apilarse (p. ej. «Enviando…» → «Enviado»). */
  id?: string | number;
  /** Botón del aviso (Reintentar, Deshacer…). */
  accion?: { etiqueta: string; onClick: () => void };
  /** Milisegundos en pantalla; por defecto según el tipo. */
  duracion?: number;
}

// Cierres forzados pendientes por id. Sonner pausa su temporizador con el cursor encima, así que el respaldo da margen de sobra
// (5 s extra): solo corta un aviso que de verdad quedó congelado (en móvil a veces no reanuda el temporizador).
const cierres = new Map<string | number, ReturnType<typeof setTimeout>>();
const MARGEN_RESPALDO_MS = 5000;

function programarCierre(id: string | number, ms: number) {
  const previo = cierres.get(id);
  if (previo) clearTimeout(previo);
  cierres.set(id, setTimeout(() => { toast.dismiss(id); cierres.delete(id); }, ms + MARGEN_RESPALDO_MS));
}

// Un aviso idéntico a otro todavía en pantalla (p. ej. tocar dos veces «Guardar») reemplaza al anterior en lugar de apilarse.
let contador = 0;
const vigentes = new Map<string, string | number>();

function mostrar(tipo: Tipo, title: string, description?: string, opciones: OpcionesToast = {}) {
  const duration = opciones.duracion ?? duracionDe(tipo);
  let id = opciones.id;
  if (id === undefined) {
    const clave = `${tipo}|${title}|${description ?? ""}`;
    const previo = vigentes.get(clave);
    if (previo !== undefined) toast.dismiss(previo);
    id = `${clave}#${++contador}`;
    vigentes.set(clave, id);
  }
  toast[tipo](title, {
    id,
    description,
    duration,
    action: opciones.accion ? { label: opciones.accion.etiqueta, onClick: opciones.accion.onClick } : undefined,
  });
  programarCierre(id, duration);
  return id;
}

/** Texto del motivo de un fallo para el usuario: el mensaje si es legible, o una indicación genérica. El detalle técnico va a la consola. */
export function motivoDeError(error: unknown): string | undefined {
  if (error == null) return undefined;
  const crudo = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const texto = crudo.trim();
  if (!texto) return "Intenta de nuevo.";
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(texto)) return "Sin conexión. Revisa tu internet.";
  // Mensajes de base de datos o de código no sirven de nada al cajero.
  if (/^(pgrst|\d{5}\b)|violates|invalid input syntax|schema cache|undefined|\bnull\b|TypeError|ReferenceError|RxError/i.test(texto)) return "Intenta de nuevo o avisa al administrador.";
  return texto;
}

export const showToast = {
  success: (title: string, description?: string, opciones?: OpcionesToast) => { mostrar("success", title, description, opciones); },
  error: (title: string, description?: string, opciones?: OpcionesToast) => { mostrar("error", title, description, opciones); },
  warning: (title: string, description?: string, opciones?: OpcionesToast) => { mostrar("warning", title, description, opciones); },
  info: (title: string, description?: string, opciones?: OpcionesToast) => { mostrar("info", title, description, opciones); },

  /**
   * Fallo de una acción: «No se pudo {accion}» + el motivo en palabras llanas. El error original se registra en la consola.
   * Ej.: showToast.fallo("registrar el pago", error)
   */
  fallo: (accion: string, error?: unknown, opciones?: OpcionesToast) => {
    if (error != null) console.error(`[No se pudo ${accion}]`, error);
    mostrar("error", `No se pudo ${accion}`, motivoDeError(error), opciones);
  },

  /** Aviso con spinner (sin cierre automático). Se reemplaza con otro aviso del mismo `id`. */
  loading: (title: string, description?: string, id: string | number = `loading|${title}`) => {
    const previo = cierres.get(id);
    if (previo) { clearTimeout(previo); cierres.delete(id); }
    toast.loading(title, { id, description });
    return id;
  },
  dismiss: (id?: string | number) => { toast.dismiss(id); },

  promise: <T>(
    promise: Promise<T>,
    data: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: unknown) => string);
    }
  ) => {
    return toast.promise(promise, data);
  },
};
