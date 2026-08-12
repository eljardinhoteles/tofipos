import { useEffect, useState } from 'react'
import { initVerticalRxDb } from '../db/rxdb'
import { useDbEpoch } from './useDbEpoch'

/**
 * Suscripción compartida a todos los pisos de la organización.
 * Ver useRxComandas.ts para el motivo de centralizar esto.
 */
export function useRxPisos() {
  const [pisos, setPisos] = useState<any[]>([])
  const dbEpoch = useDbEpoch()

  useEffect(() => {
    let alive = true
    let sub: { unsubscribe: () => void } | null = null

    ;(async () => {
      const rxDb = await initVerticalRxDb()
      if (!alive) return
      const orgId = localStorage.getItem('pos_active_org_id') || ''
      const query = rxDb.pisos.find({
        selector: { organization_id: orgId, _deleted: { $ne: true } },
        sort: [{ orden: 'asc' }, { nombre: 'asc' }]
      })
      sub = query.$.subscribe((docs: any[]) => {
        if (!alive) return
        setPisos(docs.map((doc: any) => doc.toJSON()))
      })
    })().catch(() => {})

    return () => {
      alive = false
      sub?.unsubscribe()
    }
  }, [dbEpoch])

  return { pisos }
}
