import { useEffect, useState } from 'react'
import { estadoSyncComanda, suscribirSyncComanda, type EstadoSyncComanda } from '../db/rxdb'

/**
 * Estado de sincronización de UNA comanda en este equipo (solo para mostrarlo: no bloquea ninguna acción).
 * Se recalcula cuando cambia algo de esa comanda y cuando vuelve o se pierde la conexión.
 */
export function useEstadoSyncComanda(comandaId: string | undefined | null): EstadoSyncComanda {
  const [estado, setEstado] = useState<EstadoSyncComanda>(() => estadoSyncComanda(comandaId))

  useEffect(() => {
    if (!comandaId) { setEstado('normal'); return }
    const actualizar = () => setEstado(estadoSyncComanda(comandaId))
    actualizar()
    const baja = suscribirSyncComanda(comandaId, actualizar)
    window.addEventListener('online', actualizar)
    window.addEventListener('offline', actualizar)
    return () => { baja(); window.removeEventListener('online', actualizar); window.removeEventListener('offline', actualizar) }
  }, [comandaId])

  return estado
}
