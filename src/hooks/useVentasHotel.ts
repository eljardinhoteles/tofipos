import { createContext, useContext, useMemo } from 'react';
import { useRxVentas } from './useRxVentas';
import { calcularVenta, type VentaConMovimientos } from '../lib/ventaConMovimientos';
import type { RxVenta } from '../db/rxdb';

/**
 * Ventas del Centro de Ventas conciliadas con reservas del Hotel, ya calculadas (total, pagado, saldo). Los cobros de una
 * reserva viven SOLO en su venta: de aquí sale su estado de pago real (Cloudbeds no se usa para eso).
 */
export function useVentasHotel(ids: Array<string | null | undefined>): Map<string, VentaConMovimientos> {
  const { ventas } = useRxVentas();
  const clave = [...new Set(ids.filter((x): x is string => !!x))].sort().join(',');
  return useMemo(() => {
    const buscadas = new Set(clave ? clave.split(',') : []);
    const out = new Map<string, VentaConMovimientos>();
    for (const v of ventas as RxVenta[]) if (buscadas.has(v.id)) out.set(v.id, calcularVenta(v));
    return out;
  }, [ventas, clave]);
}

/** La página Hotel lo provee una vez; tarjetas, popovers y el detalle lo leen sin volver a consultar. */
export const VentasHotelContext = createContext<Map<string, VentaConMovimientos>>(new Map());
export const useVentaDeReserva = (ventaId: string | null | undefined) => {
  const mapa = useContext(VentasHotelContext);
  return ventaId ? mapa.get(ventaId) : undefined;
};
