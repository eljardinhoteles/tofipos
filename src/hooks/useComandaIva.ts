import { useIvaActivo } from './useIvaActivo';
import type { Comanda } from '../db/database';

/**
 * Resuelve el IVA efectivo para una comanda concreta: si la comanda tiene un
 * override propio (snapshot tomado al crearla, o fijado a mano por el
 * usuario), se usa ese valor; si no, se sigue el IVA global activo en vivo
 * (comportamiento histórico, vía `useIvaActivo`).
 */
export function useComandaIva(comanda: Pick<Comanda, 'iva_porcentaje' | 'iva_precios_con_iva'> | null | undefined) {
  const global = useIvaActivo();

  if (comanda?.iva_porcentaje != null) {
    return {
      valor: comanda.iva_porcentaje / 100,
      porcentaje: comanda.iva_porcentaje,
      preciosConIva: !!comanda.iva_precios_con_iva,
      loading: false,
      esOverride: true,
    };
  }

  return { ...global, esOverride: false };
}
