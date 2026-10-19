import { createContext, useContext, useMemo } from 'react';
import { useRxMenuCatalog } from './useRxMenuCatalog';
import type { RxMenuItem } from '../db/rxdb';

/** De qué categoría del menú es cada producto vendido como extra (id del producto → su categoría). */
export interface CategoriaExtra { id: string; nombre: string; icono?: string | null }

/** La página Hotel lo provee una vez; las barras del calendario lo leen sin consultar el catálogo cada una. */
export const CategoriasExtrasContext = createContext<Map<string, CategoriaExtra>>(new Map());

export function useCategoriasPorProducto(): Map<string, CategoriaExtra> {
  const { menuItems, categorias } = useRxMenuCatalog() as { menuItems: RxMenuItem[]; categorias: Array<{ id: string; nombre: string; icono?: string | null }> };
  return useMemo(() => {
    const porCategoria = new Map(categorias.map((c) => [c.id, c]));
    const out = new Map<string, CategoriaExtra>();
    for (const m of menuItems) {
      const c = porCategoria.get(m.categoria_id);
      out.set(m.id, { id: m.categoria_id, nombre: c?.nombre ?? m.categoria_nombre ?? '', icono: c?.icono ?? null });
    }
    return out;
  }, [menuItems, categorias]);
}

/** Categorías distintas de los extras de una reserva (en orden de aparición). */
export function categoriasDeExtras(extras: Array<{ producto_id?: string; monto: number }>, porProducto: Map<string, CategoriaExtra>): CategoriaExtra[] {
  const vistas = new Map<string, CategoriaExtra>();
  for (const e of extras) {
    if (!e.producto_id || e.monto <= 0) continue;
    const c = porProducto.get(e.producto_id);
    if (c && !vistas.has(c.id)) vistas.set(c.id, c);
  }
  return [...vistas.values()];
}

export const useCategoriasExtras = () => useContext(CategoriasExtrasContext);
