import { useEffect, useRef, useState } from 'react'
import { initVerticalRxDb } from '../db/rxdb'
import { useDbEpoch } from './useDbEpoch'

/**
 * Suscripción compartida a todos los pagos (cobros de comanda/mesa) de la
 * organización. Mismo patrón de cache/memo que useRxComandas — evita crear
 * referencias nuevas cuando el contenido de un pago no cambió realmente.
 *
 * Fuente de datos para Centro de Ventas (Resumen de Cobros, Anclar
 * Pendientes). El filtrado por fecha/método/anclado se hace en el consumidor
 * sobre este array ya suscrito, no con múltiples queries RxDB.
 */
export function useRxPagos() {
  const [pagos, setPagos] = useState<any[]>([])
  const dbEpoch = useDbEpoch()
  const cacheRef = useRef(new Map<string, { json: any; snapshot: string }>())
  const listRef = useRef<any[]>([])

  useEffect(() => {
    let alive = true
    let sub: { unsubscribe: () => void } | null = null

    ;(async () => {
      const rxDb = await initVerticalRxDb()
      if (!alive) return
      const orgId = localStorage.getItem('pos_active_org_id') || ''
      const query = rxDb.pagos.find({
        selector: { organization_id: orgId, _deleted: { $ne: true } }
      })
      sub = query.$.subscribe((docs: any[]) => {
        if (!alive) return
        const cache = cacheRef.current
        const nextCache = new Map<string, { json: any; snapshot: string }>()
        let changed = docs.length !== listRef.current.length
        const next = docs.map((doc: any) => {
          const raw = doc.toJSON()
          const snapshot = JSON.stringify(raw)
          const cached = cache.get(raw.id)
          const json = cached && cached.snapshot === snapshot ? cached.json : raw
          if (json !== cached?.json) changed = true
          nextCache.set(raw.id, { json, snapshot })
          return json
        })
        cacheRef.current = nextCache
        if (changed) {
          listRef.current = next
          setPagos(next)
        }
      })
    })().catch(() => {})

    return () => {
      alive = false
      sub?.unsubscribe()
    }
  }, [dbEpoch])

  return { pagos }
}
