import { useEffect, useRef, useState } from 'react'
import { initVerticalRxDb } from '../db/rxdb'
import { useDbEpoch } from './useDbEpoch'

/**
 * Suscripción compartida a todas las comandas de la organización.
 *
 * Antes, cada página (Mesas, Órdenes, Clientes, Métricas, TableSidebar,
 * AppLayoutV2...) abría su propia query `.find({organization_id, _deleted})`
 * sobre `comandas`, duplicando N veces la misma consulta de colección completa
 * y materializando N arrays distintos con `.toJSON()` en cada emisión. Este
 * hook centraliza esa suscripción; RxDB comparte la query interna entre
 * llamadas idénticas, así que aquí solo queda una consulta viva real.
 *
 * Además evita crear referencias nuevas cuando el contenido de una comanda no
 * cambió realmente entre emisiones (comparando un snapshot JSON por id), para
 * que `memo()` en componentes hijos siga siendo efectivo.
 */
export function useRxComandas() {
  const [comandas, setComandas] = useState<any[]>([])
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
      const query = rxDb.comandas.find({
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
          setComandas(next)
        }
      })
    })().catch(() => {})

    return () => {
      alive = false
      sub?.unsubscribe()
    }
  }, [dbEpoch])

  return { comandas }
}
