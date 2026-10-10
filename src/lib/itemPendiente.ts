// Cuántas unidades de un ítem ya recibió cocina. Un producto confirmado al que luego
// se le suma una unidad sigue siendo la misma fila, así que el estado se decide por
// unidades: lo enviado es lo del snapshot de la última confirmación.

export function parseSnapshot(json?: string | null): Record<string, number> {
  try { return json ? JSON.parse(json) : {}; } catch { return {}; }
}

export function cantidadEnviada(
  item: { id: string; cantidad: number; created_at?: string | null },
  confirmadaAt: string | null | undefined,
  snapshot: Record<string, number>,
): number {
  if (!confirmadaAt || !item.created_at || item.created_at > confirmadaAt) return 0;
  const s = snapshot[item.id];
  return s === undefined ? item.cantidad : Math.min(s, item.cantidad);
}
