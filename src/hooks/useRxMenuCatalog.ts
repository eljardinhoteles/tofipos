import { useEffect, useState } from 'react'
import { initVerticalRxDb } from '../db/rxdb'
import { useDbEpoch } from './useDbEpoch'

export function useRxMenuCatalog() {
  const [menuItems, setMenuItems] = useState<any[]>([])
  const [categorias, setCategorias] = useState<any[]>([])
  const dbEpoch = useDbEpoch()

  useEffect(() => {
    let alive = true
    let menuSub: { unsubscribe: () => void } | null = null
    let catSub: { unsubscribe: () => void } | null = null

    ;(async () => {
      const rxDb = await initVerticalRxDb()
      if (!alive) return
      const orgId = localStorage.getItem('pos_active_org_id') || ''

      menuSub = rxDb.menu_items.find({
        selector: { organization_id: orgId, _deleted: { $ne: true } }
      }).$.subscribe((docs: any[]) => {
        if (!alive) return
        setMenuItems(docs.map((doc: any) => doc.toJSON()))
      })

      catSub = rxDb.categorias.find({
        selector: { organization_id: orgId, _deleted: { $ne: true } }
      }).$.subscribe((docs: any[]) => {
        if (!alive) return
        const sortedCats = docs.map((doc: any) => doc.toJSON()).sort((a, b) => {
          if ((a.orden ?? 0) !== (b.orden ?? 0)) return (a.orden ?? 0) - (b.orden ?? 0)
          return (a.nombre || '').localeCompare(b.nombre || '')
        })
        setCategorias(sortedCats)
      })
    })().catch(() => {})

    return () => {
      alive = false
      menuSub?.unsubscribe()
      catSub?.unsubscribe()
    }
  }, [dbEpoch])

  return { menuItems, categorias }
}
