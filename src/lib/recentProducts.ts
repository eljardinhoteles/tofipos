// Historial de productos usados recientemente EN ESTE DISPOSITIVO — guardado
// en localStorage, no sincroniza entre celulares ni con el resto de la
// organización. Alimenta la fila "Usados recientemente" del selector de
// productos, para repetir rápido lo que el mesero pide más seguido desde
// este equipo (ej. clientes que piden "lo mismo de siempre").
const STORAGE_KEY = 'pos_recent_product_ids'
const MAX_RECENT = 6

export function getRecentProductIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function registerRecentProduct(itemId: string): void {
  try {
    const current = getRecentProductIds().filter((id) => id !== itemId)
    const next = [itemId, ...current].slice(0, MAX_RECENT)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // localStorage puede fallar (modo privado, cuota llena) — el historial
    // es una conveniencia, no algo crítico, así que se ignora en silencio.
  }
}
