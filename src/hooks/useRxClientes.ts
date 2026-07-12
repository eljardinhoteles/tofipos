import { useEffect, useState } from 'react'
import { initVerticalRxDb } from '../db/rxdb'
import { useDbEpoch } from './useDbEpoch'

export function useRxClientes() {
  const [clientes, setClientes] = useState<any[]>([])
  const dbEpoch = useDbEpoch()

  useEffect(() => {
    let alive = true
    let sub: { unsubscribe: () => void } | null = null

    ;(async () => {
      const rxDb = await initVerticalRxDb()
      if (!alive) return
      const orgId = localStorage.getItem('pos_active_org_id') || ''
      const query = rxDb.clientes.find({
        selector: { organization_id: orgId, _deleted: { $ne: true } }
      })
      sub = query.$.subscribe((docs: any[]) => {
        if (!alive) return
        setClientes(docs.map((doc: any) => doc.toJSON()))
      })
    })().catch(() => {})

    return () => {
      alive = false
      sub?.unsubscribe()
    }
  }, [dbEpoch])

  return { clientes }
}
