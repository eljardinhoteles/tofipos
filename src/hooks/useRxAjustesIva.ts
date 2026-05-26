import { useEffect, useState } from 'react'
import { initVerticalRxDb } from '../db/rxdb'

export function useRxAjustesIva() {
  const [ajustesIva, setAjustesIva] = useState<any[]>([])

  useEffect(() => {
    let alive = true
    let sub: { unsubscribe: () => void } | null = null

    ;(async () => {
      const rxDb = await initVerticalRxDb()
      if (!alive) return
      const orgId = localStorage.getItem('pos_active_org_id') || ''
      const query = rxDb.ajustes_iva.find({
        selector: { organization_id: orgId, _deleted: { $ne: true } }
      })
      sub = query.$.subscribe((docs: any[]) => {
        if (!alive) return
        setAjustesIva(docs.map((doc: any) => doc.toJSON()))
      })
    })().catch(() => {})

    return () => {
      alive = false
      sub?.unsubscribe()
    }
  }, [])

  return { ajustesIva }
}
