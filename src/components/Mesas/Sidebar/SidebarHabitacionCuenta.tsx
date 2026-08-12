import { useEffect, useState } from 'react'
import { type Mesa } from '../../../db/database'
import { CheckinForm } from './habitacion/CheckinForm'
import { CuentaView } from './habitacion/CuentaView'
import { HabitacionCheckoutView } from './habitacion/HabitacionCheckoutView'
import { initVerticalRxDb } from '../../../db/rxdb'
import { useUI } from '../../../context/UIContext'

interface SidebarHabitacionCuentaProps {
  selectedMesa: Mesa
  onClose: () => void
}

export function SidebarHabitacionCuenta({ selectedMesa, onClose }: SidebarHabitacionCuentaProps) {
  const { setViewingComandaId } = useUI()
  const [checkoutComanda, setCheckoutComanda] = useState<any>(null)
  const [cuentaActiva, setCuentaActiva] = useState<any | null>(null)

  useEffect(() => {
    let alive = true
    let sub: { unsubscribe: () => void } | null = null
    ;(async () => {
      const rxDb = await initVerticalRxDb()
      const orgId = localStorage.getItem('pos_active_org_id') || ''
      const query = rxDb.habitacion_cuentas.find({
        selector: { mesa_id: selectedMesa.id, estado: 'activa', organization_id: orgId, _deleted: { $ne: true } }
      })
      sub = query.$.subscribe((docs: any[]) => {
        if (!alive) return
        setCuentaActiva(docs[0] ? docs[0].toJSON() : null)
      })
    })().catch(() => {})
    return () => {
      alive = false
      sub?.unsubscribe()
    }
  }, [selectedMesa.id])

  if (checkoutComanda && cuentaActiva) {
    return (
      <HabitacionCheckoutView
        cuenta={cuentaActiva}
        selectedMesa={selectedMesa}
        checkoutData={checkoutComanda}
        onBack={() => setCheckoutComanda(null)}
        onSuccess={() => {
          setCheckoutComanda(null)
          onClose()
        }}
      />
    )
  }

  if (cuentaActiva) {
    return (
      <CuentaView
        cuenta={cuentaActiva}
        selectedMesa={selectedMesa}
        onClose={onClose}
        onCheckout={(data) => setCheckoutComanda(data)}
        onOpenComanda={(comandaId) => setViewingComandaId(comandaId)}
      />
    )
  }

  return <CheckinForm selectedMesa={selectedMesa} onClose={onClose} />
}
