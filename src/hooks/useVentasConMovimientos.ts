import { useMemo } from 'react'
import { useRxVentas } from './useRxVentas'
import { calcularVenta, type VentaConMovimientos } from '../lib/ventaConMovimientos'
import type { RxVenta, VentaOrigen } from '../db/rxdb'

export type { VentaConMovimientos }

/**
 * Fuente única de datos del Centro de Ventas v2: cada RxVenta ya trae su
 * historial embebido (`movimientos`) — este hook solo deriva monto total,
 * saldo y estado (anclado/facturado/anulado), nunca son campos propios,
 * siempre se recalculan sumando/inspeccionando el array.
 */
export function useVentasConMovimientos(opciones: { desde?: string | null } = {}) {
  const { ventas } = useRxVentas(opciones)

  const items = useMemo<VentaConMovimientos[]>(() => {
    return (ventas as RxVenta[])
      .map(calcularVenta)
      .sort((a, b) => new Date(b.fechaUltimoMovimiento).getTime() - new Date(a.fechaUltimoMovimiento).getTime())
  }, [ventas])

  return { items }
}

export type { VentaOrigen }
