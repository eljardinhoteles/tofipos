import { useEffect, useRef, useState } from 'react'
import { initVerticalRxDb } from '../db/rxdb'
import { useDbEpoch } from './useDbEpoch'

/**
 * Suscripción compartida a las ventas (Centro de Ventas v2) de la
 * organización, todas o solo las tocadas desde `desde`. Mismo patrón de cache/memo que useRxPagos — evita crear
 * referencias nuevas cuando el contenido de una venta no cambió realmente.
 */
export function useRxVentas(opciones: { desde?: string | null } = {}) {
  // Solo las ventas tocadas desde esta fecha (ISO). Sin fecha, todas. El índice de `_modified` hace barata la consulta.
  const desde = opciones.desde ?? null
  const [ventas, setVentas] = useState<any[]>([])
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
      const query = rxDb.ventas.find({
        selector: {
          organization_id: orgId,
          _deleted: { $ne: true },
          ...(desde ? { _modified: { $gte: desde } } : {}),
        },
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
          setVentas(next)
        }
      })
    })().catch(() => {})

    return () => {
      alive = false
      sub?.unsubscribe()
    }
  }, [dbEpoch, desde])

  return { ventas }
}
