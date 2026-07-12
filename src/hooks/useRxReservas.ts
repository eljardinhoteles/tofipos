import { useEffect, useState } from 'react'
import { initVerticalRxDb } from '../db/rxdb'
import { useDbEpoch } from './useDbEpoch'

export function useRxReservas() {
  const [reservas, setReservas] = useState<any[]>([])
  const dbEpoch = useDbEpoch()

  useEffect(() => {
    let alive = true
    let sub: { unsubscribe: () => void } | null = null

    ;(async () => {
      const rxDb = await initVerticalRxDb()
      if (!alive) return
      const orgId = localStorage.getItem('pos_active_org_id') || ''
      const query = rxDb.reservas.find({
        selector: { organization_id: orgId, _deleted: { $ne: true } },
        sort: [{ fecha: 'asc' }, { hora: 'asc' }]
      })
      sub = query.$.subscribe((docs: any[]) => {
        if (!alive) return
        setReservas(docs.map((doc: any) => doc.toJSON()))
      })
    })().catch(() => {})

    return () => {
      alive = false
      sub?.unsubscribe()
    }
  }, [dbEpoch])

  return { reservas }
}
