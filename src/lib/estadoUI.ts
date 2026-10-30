// Android puede matar la app cuando lleva un rato en segundo plano y al volver arranca de cero: todo lo que vivía solo en pantalla
// (zona elegida, mesa abierta, vista, pantalla en la que se estaba) se perdía. Aquí se guarda lo mínimo para volver donde se estaba.
// Solo vale un rato: pasado el plazo se ignora, para no devolver a alguien a una mesa de hace horas.

const CLAVE = 'pos_estado_ui_v1';
const VIGENCIA_MS = 3 * 60 * 60 * 1000;

export interface EstadoUI {
  /** Última pantalla (ruta) en la que se estuvo. */
  ruta?: string;
  /** Zona elegida en Mesas. */
  piso?: string;
  /** Mesa abierta y la vista en que estaba (mapa o elegir productos). */
  mesaId?: string | null;
  mesaView?: 'mapa' | 'productos';
  /** La mesa abierta es una habitación del hotel (otro flujo de cuentas). */
  mesaEsHabitacion?: boolean;
}

type Guardado = EstadoUI & { ts: number };

function leerCrudo(): Guardado | null {
  try {
    const crudo = localStorage.getItem(CLAVE);
    return crudo ? (JSON.parse(crudo) as Guardado) : null;
  } catch { return null; }
}

/** Lo guardado, o `{}` si no hay nada o ya venció. */
export function leerEstadoUI(): EstadoUI {
  const g = leerCrudo();
  if (!g || Date.now() - g.ts > VIGENCIA_MS) return {};
  const { ts: _ts, ...resto } = g;
  void _ts;
  return resto;
}

/** Mezcla `parcial` con lo ya guardado (un `undefined` borra esa clave) y renueva la vigencia. */
export function guardarEstadoUI(parcial: EstadoUI) {
  try {
    const actual = leerEstadoUI();
    const nuevo: Guardado = { ...actual, ...parcial, ts: Date.now() };
    for (const k of Object.keys(parcial) as Array<keyof EstadoUI>) if (parcial[k] === undefined) delete nuevo[k];
    localStorage.setItem(CLAVE, JSON.stringify(nuevo));
  } catch { /* sin almacenamiento: se pierde la comodidad, no la app */ }
}
