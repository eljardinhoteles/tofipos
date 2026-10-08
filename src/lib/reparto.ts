// Reparto del valor de un plato entre subcomandas (amigos que se dividen el
// consumo del cumpleañero). El plato original queda en su cuenta a $0 (sigue
// existiendo para cocina) y cada subcomanda destino recibe una línea "parte"
// con su fracción del valor. Las partes nunca se envían a cocina.

export type RepartoOrigen = {
  tipo: 'origen';
  /** Precio unitario original, para poder deshacer. */
  precio: number;
  /** Unidades repartidas. */
  cantidad: number;
  partes: Array<{ id: string; comanda_id: string }>;
};

export type RepartoParte = {
  tipo: 'parte';
  /** id del ítem "origen" del que sale esta parte. */
  origen: string;
  /** Total de partes entre las que se repartió. */
  n: number;
  /** Posición de esta parte (1..n). Ausente en repartos creados antes de numerarlas. */
  i?: number;
};

export type RepartoMeta = RepartoOrigen | RepartoParte;

export function parseReparto(item: { reparto?: string | null } | null | undefined): RepartoMeta | null {
  if (!item?.reparto) return null;
  try {
    const meta = JSON.parse(item.reparto) as RepartoMeta;
    return meta?.tipo === 'origen' || meta?.tipo === 'parte' ? meta : null;
  } catch {
    return null;
  }
}

/** Línea que representa solo una fracción del valor de un plato: cocina no la prepara. */
export function esParteRepartida(item: { reparto?: string | null } | null | undefined): boolean {
  return parseReparto(item)?.tipo === 'parte';
}

/**
 * Divide `valor` en `n` partes iguales a centavos. Lo que sobra por redondeo se
 * reparte de a un centavo desde la primera parte, así la suma es exactamente `valor`.
 */
export function calcularPartes(valor: number, n: number): number[] {
  if (n <= 0) return [];
  const centavos = Math.round(valor * 100);
  const base = Math.floor(centavos / n);
  const resto = centavos - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < resto ? 1 : 0)) / 100);
}

/** Nombre del plato sin el sufijo de parte ("Pastel · parte 2/3" o el antiguo "Pastel (1/3)"). */
export function nombreBaseReparto(nombre: string): string {
  return nombre.replace(/ · parte \d+\/\d+$/, '').replace(/ \(1\/\d+\)$/, '');
}
