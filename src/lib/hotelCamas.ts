/**
 * Camas por planta. Una habitación de varias plantas (p. ej. un cuarto por piso) guarda sus camas como «Planta 1: Matrimonial»
 * y una reserva guarda una cama por planta unidas con « · » («Planta 1: Matrimonial · Planta 2: 2 individuales»).
 * Sin prefijo de planta todo funciona como antes (una sola cama), así que no hace falta migración.
 */
const SEP_PLANTA = ': ';
const SEP_SELECCION = ' · ';

export interface GrupoPlanta { planta: string; camas: string[] }

export const componerCama = (planta: string, cama: string) => (planta.trim() ? `${planta.trim()}${SEP_PLANTA}${cama.trim()}` : cama.trim());

function partir(c: string): { planta: string | null; nombre: string } {
  const i = c.indexOf(SEP_PLANTA);
  return i > 0 ? { planta: c.slice(0, i), nombre: c.slice(i + SEP_PLANTA.length) } : { planta: null, nombre: c };
}

/** Camas de la habitación agrupadas por planta (en orden de aparición), o null si no usa plantas. */
export function agruparPlantas(camas: string[]): GrupoPlanta[] | null {
  const grupos: GrupoPlanta[] = [];
  for (const c of camas) {
    const { planta } = partir(c);
    if (!planta) continue;
    const g = grupos.find((x) => x.planta === planta);
    if (g) g.camas.push(c); else grupos.push({ planta, camas: [c] });
  }
  return grupos.length > 0 ? grupos : null;
}

/** Cama elegida en cada planta, a partir del texto guardado en la reserva. */
export function leerSeleccion(valor: string | null | undefined): Record<string, string> {
  const r: Record<string, string> = {};
  for (const trozo of (valor ?? '').split(SEP_SELECCION)) {
    const { planta } = partir(trozo);
    if (planta) r[planta] = trozo;
  }
  return r;
}

/** Texto a guardar en la reserva: una cama por planta, en el orden de las plantas; null si no hay ninguna. */
export function escribirSeleccion(grupos: GrupoPlanta[], sel: Record<string, string>): string | null {
  const partes = grupos.map((g) => sel[g.planta]).filter(Boolean);
  return partes.length > 0 ? partes.join(SEP_SELECCION) : null;
}
