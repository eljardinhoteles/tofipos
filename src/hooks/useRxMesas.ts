import { useEffect, useState } from 'react'
import { initVerticalRxDb } from '../db/rxdb'
import { useDbEpoch } from './useDbEpoch'
import { readHookCache, commitHookCache } from './rxHookCache'

/**
 * Suscripción compartida a todas las mesas de la organización.
 * Ver useRxComandas.ts para el motivo de centralizar esto.
 */
export function useRxMesas() {
  const [mesas, setMesas] = useState<any[]>(() => readHookCache<any[]>('mesas', []))
  const dbEpoch = useDbEpoch()

  useEffect(() => {
    let alive = true
    let sub: { unsubscribe: () => void } | null = null

    ;(async () => {
      const rxDb = await initVerticalRxDb()
      if (!alive) return
      const orgId = localStorage.getItem('pos_active_org_id') || ''
      const query = rxDb.mesas.find({
        selector: { organization_id: orgId, _deleted: { $ne: true } }
      })
      sub = query.$.subscribe((docs: any[]) => {
        if (!alive) return
        setMesas(commitHookCache('mesas', docs.map((doc: any) => doc.toJSON())))
      })
    })().catch(() => {})

    return () => {
      alive = false
      sub?.unsubscribe()
    }
  }, [dbEpoch])

  return { mesas }
}
