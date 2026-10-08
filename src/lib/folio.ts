import { useSyncExternalStore } from 'react'

// Número de comanda visible. Si dos comandas de la misma organización llegan
// con el mismo `folio` (p. ej. dos dispositivos que crearon una comanda a la
// vez), la más antigua conserva "397" y las demás se muestran como "397-1",
// "397-2"… Es solo una etiqueta derivada (no se guarda ni cambia el folio real),
// así que todos los dispositivos calculan lo mismo con los mismos datos.

type ComandaFolio = { id?: string | null; folio?: number | string | null; created_at?: string | null }

let labels = new Map<string, string>()
let repetidos = 0
let version = 0
const listeners = new Set<() => void>()

/** Etiquetas de las comandas cuyo folio está repetido (id → "397-1"). Las únicas no aparecen. */
export function buildFolioLabels(comandas: ComandaFolio[]): Map<string, string> {
  const porFolio = new Map<string, ComandaFolio[]>()
  for (const c of comandas) {
    if (c.id == null || c.folio == null || c.folio === 0) continue
    const k = String(c.folio)
    const g = porFolio.get(k)
    if (g) g.push(c)
    else porFolio.set(k, [c])
  }
  const out = new Map<string, string>()
  for (const [folio, grupo] of porFolio) {
    if (grupo.length < 2) continue
    grupo.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '') || String(a.id).localeCompare(String(b.id)))
    grupo.slice(1).forEach((c, i) => out.set(String(c.id), `${folio}-${i + 1}`))
  }
  return out
}

/** Actualiza las etiquetas; devuelve cuántas comandas tienen número repetido. */
export function setFolioLabels(next: Map<string, string>): number {
  let igual = next.size === labels.size
  if (igual) for (const [k, v] of next) if (labels.get(k) !== v) { igual = false; break }
  if (!igual) {
    labels = next
    version += 1
    listeners.forEach(l => l())
  }
  repetidos = next.size
  return repetidos
}

export function folioRepetidos() { return repetidos }

/** Texto del número de comanda ("397" o "397-1" si está repetido). */
export function folioLabel(c: ComandaFolio | null | undefined): string {
  if (!c) return ''
  return (c.id != null && labels.get(String(c.id))) || (c.folio != null ? String(c.folio) : '')
}

/** Re-renderiza cuando cambian las etiquetas (llamar una vez en el layout). */
export function useFolioVersion() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb) } },
    () => version
  )
}

const CLAVE_AVISADOS = 'pos_folios_repetidos_avisados'

function leerAvisados(): Set<string> {
  try { return new Set<string>(JSON.parse(localStorage.getItem(CLAVE_AVISADOS) || '[]')) } catch { return new Set() }
}

/**
 * Ids de comandas repetidas que todavía no se avisaron en este equipo. Se
 * recuerdan en localStorage: un repetido ya conocido no vuelve a avisar en cada
 * arranque, solo uno nuevo.
 */
export function repetidosSinAvisar(ids: string[]): string[] {
  const vistos = leerAvisados()
  const nuevos = ids.filter(id => !vistos.has(id))
  if (nuevos.length > 0) {
    nuevos.forEach(id => vistos.add(id))
    try { localStorage.setItem(CLAVE_AVISADOS, JSON.stringify([...vistos].slice(-500))) } catch { /* sin storage */ }
  }
  return nuevos
}
