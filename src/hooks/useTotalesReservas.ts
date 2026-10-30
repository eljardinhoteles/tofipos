import { useEffect, useMemo, useState } from 'react';
import { initVerticalRxDb } from '../db/rxdb';
import { calcularTotalesComanda } from '../lib/taxUtils';
import { crearEstabilizador } from '../lib/estabilizarDocs';
import { useRxMenuCatalog } from './useRxMenuCatalog';
import { useRxComandas } from './useRxComandas';
import { useIvaActivo } from './useIvaActivo';
import { useDbEpoch } from './useDbEpoch';
import type { Reserva, ComandaItem } from '../db/database';

/**
 * Total del pedido de cada reserva (id de reserva → total), con el mismo cálculo del detalle: productos no anulados, sin cortesías y con el
 * IVA de la propia comanda si lo fijó (si no, el IVA global). Una sola suscripción para todas las reservas visibles, no una por tarjeta.
 */
export function useTotalesReservas(reservas: Reserva[]): Map<string, number> {
  const dbEpoch = useDbEpoch();
  const { menuItems } = useRxMenuCatalog();
  const { comandas } = useRxComandas();
  const iva = useIvaActivo();
  const [items, setItems] = useState<ComandaItem[]>([]);
  const ids = useMemo(() => [...new Set(reservas.map(r => r.comanda_id).filter((x): x is string => !!x))].sort().join(','), [reservas]);

  useEffect(() => {
    if (!ids) return;
    let alive = true;
    let sub: { unsubscribe: () => void } | null = null;
    (async () => {
      const rxDb = await initVerticalRxDb();
      if (!alive) return;
      const estabilizar = crearEstabilizador<ComandaItem>();
      sub = rxDb.comanda_items
        .find({ selector: { comanda_id: { $in: ids.split(',') }, _deleted: { $ne: true } } })
        .$.subscribe((docs) => { if (alive) setItems(estabilizar(docs.map((d) => d.toJSON() as ComandaItem))); });
    })().catch(() => {});
    return () => { alive = false; sub?.unsubscribe(); };
  }, [ids, dbEpoch]);

  return useMemo(() => {
    const porComanda = new Map<string, ComandaItem[]>();
    for (const it of items) porComanda.set(it.comanda_id, [...(porComanda.get(it.comanda_id) ?? []), it]);
    const comandaPorId = new Map((comandas as Array<{ id: string; iva_porcentaje?: number | null; iva_precios_con_iva?: boolean }>).map(c => [c.id, c]));
    const out = new Map<string, number>();
    for (const r of reservas) {
      if (!r.comanda_id) continue;
      const c = comandaPorId.get(r.comanda_id);
      const tasa = c?.iva_porcentaje != null ? c.iva_porcentaje : iva.porcentaje;
      const conIva = c?.iva_porcentaje != null ? !!c.iva_precios_con_iva : iva.preciosConIva;
      out.set(r.id, calcularTotalesComanda(porComanda.get(r.comanda_id) ?? [], menuItems, tasa, conIva).total);
    }
    return out;
  }, [items, reservas, comandas, menuItems, iva.porcentaje, iva.preciosConIva]);
}
