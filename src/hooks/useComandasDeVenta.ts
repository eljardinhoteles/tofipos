import { useMemo } from 'react';
import { folioLabel } from '../lib/folio';
import { useRxComandas } from './useRxComandas';
import type { RxVenta, RxVentaMovimiento } from '../db/rxdb';

// Comandas ligadas a una venta: la comanda de la venta y las que se cerraron
// contra ella (checkout de habitación con varias, subcomandas que usaron el
// anticipo). Antes solo se veían como números sueltos en el título.
export function useComandasDeVenta(venta: RxVenta, movimientos: RxVentaMovimiento[]) {
  const { comandas } = useRxComandas() as { comandas: any[] };

  // Folios mencionados en la referencia ("Mesa 3 · #12", "Comandas #12, #13") y en
  // las marcas de anticipo / cuenta cerrada de los movimientos.
  const folios = useMemo(() => {
    const set = new Set<string>();
    const leer = (texto?: string | null) => {
      for (const m of (texto ?? '').matchAll(/#(\d+(?:-\d+)?)/g)) set.add(m[1]);
    };
    leer(venta.referencia);
    for (const m of movimientos) if (m.tipo === 'comentario') leer(m.motivo);
    return set;
  }, [venta.referencia, movimientos]);

  const relacionadas = useMemo(
    () => comandas
      .filter(c => c.id === venta.comanda_id || folios.has(folioLabel(c)))
      .sort((a, b) => Number(a.folio) - Number(b.folio)),
    [comandas, folios, venta.comanda_id]
  );
  return relacionadas;
}
