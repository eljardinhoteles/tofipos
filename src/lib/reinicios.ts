// Diagnóstico de reinicios: cada vez que la app arranca se anota cuánto estuvo "fuera" y cómo se abrió, para saber si Android la está
// matando en segundo plano (el código nunca se recarga solo). El «latido» marca el último momento en que la app estaba viva.

const CLAVE_LISTA = 'pos_reinicios_v1';
const CLAVE_LATIDO = 'pos_ultimo_activo';
const MAX = 30;

export interface Reinicio {
  ts: number;
  /** Minutos desde el último latido (null en el primer arranque del equipo). */
  fueraMin: number | null;
  /** navigate / reload / back_forward: cómo abrió el navegador la página. */
  tipo: string;
  /** El navegador marca la pestaña como descartada por falta de memoria. */
  descartada: boolean;
}

const leer = (): Reinicio[] => {
  try { return JSON.parse(localStorage.getItem(CLAVE_LISTA) || '[]') as Reinicio[]; } catch { return []; }
};

/** Anota este arranque. Llamar una vez al iniciar, antes de empezar el latido. */
export function registrarArranque() {
  try {
    const ahora = Date.now();
    const ultimo = Number(localStorage.getItem(CLAVE_LATIDO) || 0);
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const entrada: Reinicio = {
      ts: ahora,
      fueraMin: ultimo ? Math.round((ahora - ultimo) / 60000) : null,
      tipo: nav?.type ?? 'desconocido',
      descartada: (document as Document & { wasDiscarded?: boolean }).wasDiscarded === true,
    };
    localStorage.setItem(CLAVE_LISTA, JSON.stringify([...leer(), entrada].slice(-MAX)));
    console.info('[arranque]', entrada);
  } catch { /* diagnóstico opcional */ }
}

/** Marca que la app sigue viva: al ocultarse, al cerrarse y cada 15 s mientras está a la vista. */
export function mantenerLatido() {
  const latido = () => { try { localStorage.setItem(CLAVE_LATIDO, String(Date.now())); } catch { /* sin almacenamiento */ } };
  latido();
  document.addEventListener('visibilitychange', latido);
  window.addEventListener('pagehide', latido);
  setInterval(() => { if (document.visibilityState === 'visible') latido(); }, 15_000);
}

/** Arranques de las últimas `horas` horas, del más reciente al más antiguo. */
export function reiniciosRecientes(horas = 24): Reinicio[] {
  const desde = Date.now() - horas * 3_600_000;
  return leer().filter((r) => r.ts >= desde).reverse();
}
