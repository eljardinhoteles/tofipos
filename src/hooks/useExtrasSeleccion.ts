import { useMemo, useState } from 'react';
import { useRxMenuCatalog } from './useRxMenuCatalog';
import { useIvaActivo } from './useIvaActivo';
import type { RxMenuItem } from '../db/rxdb';
import { calcularPreciosItem, obtenerIvaProducto } from '../lib/taxUtils';

/** Un producto elegido como extra de una reserva. `roomTypeID`: la cabaña a la que va (al crear un grupo). */
export interface ItemExtra { key: string; producto: RxMenuItem; cantidad: number; precio: string; roomTypeID: string }

/**
 * Selección de extras de una reserva (al crearla o al editarla): productos activos del sistema, cantidades, y el monto de
 * cada extra con los impuestos del POS (IVA del sistema o el propio del producto; precios con IVA incluido o no).
 * `roomTypeIDNuevo`: cabaña a la que se asigna un extra recién elegido.
 */
export function useExtrasSeleccion(roomTypeIDNuevo = '') {
  const { menuItems, categorias } = useRxMenuCatalog() as { menuItems: RxMenuItem[]; categorias: Array<{ id: string; nombre: string; icono?: string | null }> };
  const { porcentaje: tasaIva, preciosConIva } = useIvaActivo() as { porcentaje: number; preciosConIva: boolean };
  const [items, setItems] = useState<ItemExtra[]>([]);

  const activos = useMemo(() => [...menuItems].filter((m) => m.activo !== false).sort((x, y) => x.nombre.localeCompare(y.nombre, 'es', { sensitivity: 'base', numeric: true })), [menuItems]);
  const cantidades = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of items) m.set(x.producto.id, (m.get(x.producto.id) ?? 0) + x.cantidad);
    return m;
  }, [items]);

  const sumar = (p: RxMenuItem) => setItems((a) => {
    const ya = a.find((x) => x.producto.id === p.id && !p.precio_variable);
    if (ya) return a.map((x) => (x === ya ? { ...x, cantidad: x.cantidad + 1 } : x));
    return [...a, { key: crypto.randomUUID(), producto: p, cantidad: 1, precio: String(p.precio ?? 0), roomTypeID: roomTypeIDNuevo }];
  });
  const restar = (p: RxMenuItem) => setItems((a) => {
    const i = a.findIndex((x) => x.producto.id === p.id);
    if (i < 0) return a;
    return a[i].cantidad > 1 ? a.map((x, j) => (j === i ? { ...x, cantidad: x.cantidad - 1 } : x)) : a.filter((_, j) => j !== i);
  });
  const cambiar = (key: string, patch: Partial<ItemExtra>) => setItems((a) => a.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const quitar = (key: string) => setItems((a) => a.filter((x) => x.key !== key));

  const calculo = (x: ItemExtra) => {
    const pct = obtenerIvaProducto(x.producto as never, tasaIva);
    return { pct, ...calcularPreciosItem(parseFloat(x.precio) || 0, x.cantidad, pct, preciosConIva) };
  };
  /** Lo que el extra suma a la reserva: con impuestos. */
  const monto = (x: ItemExtra) => Math.round(calculo(x).subtotalBruto * 100) / 100;
  const total = items.reduce((a, x) => a + monto(x), 0);
  const neto = items.reduce((a, x) => a + calculo(x).subtotalNeto, 0);

  return { items, activos, categorias, cantidades, tasaIva, preciosConIva, sumar, restar, cambiar, quitar, monto, total, neto, iva: total - neto };
}
