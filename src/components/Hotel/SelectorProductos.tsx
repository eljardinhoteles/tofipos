import { useMemo, useState } from 'react';
import { ArrowLeft, CaretRight, MagnifyingGlass, Minus, Plus, SquaresFour } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { getCategoryIcon } from '@/lib/categoryIcons';
import type { RxMenuItem } from '../../db/rxdb';
import { obtenerIvaProducto } from '../../lib/taxUtils';
import { normalizarTexto } from '../../lib/hotelConciliacion';

const SIN_CATEGORIA = '__sin';
const dinero = (n: number) => `$${n.toFixed(2)}`;

interface Props {
  /** Productos activos del menú, ya ordenados. */
  productos: RxMenuItem[];
  categorias: Array<{ id: string; nombre: string; icono?: string | null }>;
  /** Cuántas unidades hay de cada producto (id → cantidad). */
  cantidades: Map<string, number>;
  tasaIva: number;
  preciosConIva: boolean;
  onSumar: (p: RxMenuItem) => void;
  onRestar: (p: RxMenuItem) => void;
}

/**
 * Selector de productos del sistema (como el del planificador): buscador, lista de categorías y, dentro de cada una, sus
 * productos con un botón + / contador. Lo usan la creación de reservas y la edición de extras.
 */
export function SelectorProductos({ productos, categorias, cantidades, tasaIva, preciosConIva, onSumar, onRestar }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const buscando = busqueda.trim().length > 0;
  const nombreCategoria = (id: string) => (id === SIN_CATEGORIA ? 'Sin categoría' : categorias.find((c) => c.id === id)?.nombre ?? 'Sin categoría');

  const listaCategorias = useMemo(() => {
    const conteo = new Map<string, { n: number; marcados: number }>();
    for (const m of productos) {
      const id = m.categoria_id || SIN_CATEGORIA;
      const v = conteo.get(id) ?? { n: 0, marcados: 0 };
      v.n += 1;
      v.marcados += cantidades.get(m.id) ?? 0;
      conteo.set(id, v);
    }
    const orden = new Map(categorias.map((c, i) => [c.id, i]));
    return [...conteo.entries()]
      .map(([id, v]) => ({ id, nombre: nombreCategoria(id), ...v, Icono: getCategoryIcon(categorias.find((c) => c.id === id)?.icono) ?? SquaresFour }))
      .sort((x, y) => (orden.get(x.id) ?? 1e6) - (orden.get(y.id) ?? 1e6) || x.nombre.localeCompare(y.nombre, 'es'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos, categorias, cantidades]);

  const visibles = useMemo(() => {
    const q = normalizarTexto(busqueda);
    if (q) return productos.filter((m) => normalizarTexto(m.nombre).includes(q) || normalizarTexto(nombreCategoria(m.categoria_id || SIN_CATEGORIA)).includes(q)).slice(0, 80);
    if (categoria === null) return [];
    return productos.filter((m) => (m.categoria_id || SIN_CATEGORIA) === categoria);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos, categoria, busqueda, categorias]);

  return (
    <>
      <div className="relative shrink-0">
        <MagnifyingGlass size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden />
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar en todas las categorías…" aria-label="Buscar producto"
          className="h-12 w-full rounded-2xl bg-card border border-border pl-11 pr-3 t-fila outline-none focus-visible:ring-2 focus-visible:ring-primary/30" />
      </div>
      <div className="rounded-2xl border border-border bg-card overflow-hidden shrink-0">
        {!buscando && categoria !== null && (
          <button type="button" onClick={() => setCategoria(null)} className="w-full min-h-14 flex items-center gap-2 px-4 py-3 border-b border-border text-left hover:bg-muted/60 cursor-pointer transition-colors">
            <ArrowLeft size={16} weight="bold" className="text-muted-foreground shrink-0" />
            <span className="flex-1 min-w-0 truncate t-titulo">{nombreCategoria(categoria)}</span>
            <span className="t-cuerpo-fuerte text-muted-foreground tabular-nums">{visibles.length}</span>
          </button>
        )}
        {!buscando && categoria === null ? (
          listaCategorias.length === 0 ? <p className="px-4 py-8 text-center t-cuerpo text-muted-foreground">No hay productos en el menú.</p> : (
            <ul className="flex flex-col">
              {listaCategorias.map(({ id, nombre, n, marcados, Icono }) => (
                <li key={id}>
                  <button type="button" onClick={() => setCategoria(id)} className="w-full min-h-16 text-left px-4 py-3 flex items-center gap-3.5 border-b border-border/60 last:border-b-0 hover:bg-muted/60 cursor-pointer transition-colors">
                    <span className="size-11 rounded-xl bg-muted text-foreground flex items-center justify-center shrink-0"><Icono size={22} weight="bold" /></span>
                    <span className="flex-1 min-w-0 truncate t-fila">{nombre}</span>
                    {marcados > 0 && <span className="shrink-0 min-w-6 h-6 px-2 rounded-full bg-primary text-primary-foreground t-dato flex items-center justify-center tabular-nums" aria-label={`${marcados} añadidos`}>{marcados}</span>}
                    <span className="t-cuerpo-fuerte text-muted-foreground tabular-nums">{n}</span>
                    <CaretRight size={16} weight="bold" className="text-muted-foreground/60 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : (
          <ul className="flex flex-col">
            {visibles.length === 0 && <li className="px-4 py-8 text-center t-cuerpo text-muted-foreground">Sin resultados</li>}
            {visibles.map((m) => {
              const cant = cantidades.get(m.id) ?? 0;
              const pct = obtenerIvaProducto(m as never, tasaIva);
              return (
                <li key={m.id} className={cn('min-h-16 px-4 py-2.5 flex items-center gap-3 border-b border-border/60 last:border-b-0 transition-colors', cant > 0 && 'bg-primary/10')}>
                  <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="truncate t-fila">{m.nombre}</span>
                    <span className="t-cuerpo text-muted-foreground truncate">
                      {buscando ? `${nombreCategoria(m.categoria_id || SIN_CATEGORIA)} · ` : ''}
                      {m.precio_variable ? 'Precio variable' : dinero(m.precio ?? 0)}
                      {pct > 0 ? ` · ${preciosConIva ? 'IVA incl.' : `+ IVA ${pct}%`}` : ' · sin IVA'}
                    </span>
                  </span>
                  {cant === 0 ? (
                    <button type="button" onClick={() => onSumar(m)} aria-label={`Añadir ${m.nombre}`} className="size-11 rounded-full bg-primary/10 text-primary flex items-center justify-center cursor-pointer hover:bg-primary/20 transition-colors shrink-0">
                      <Plus size={18} weight="bold" />
                    </button>
                  ) : (
                    <div className="flex items-center gap-0.5 rounded-2xl border border-border bg-card p-0.5 shrink-0" role="group" aria-label={`Cantidad de ${m.nombre}`}>
                      <button type="button" onClick={() => onRestar(m)} aria-label={`Quitar uno de ${m.nombre}`} className="size-10 rounded-xl flex items-center justify-center cursor-pointer hover:bg-muted"><Minus size={16} weight="bold" /></button>
                      <span className="min-w-7 text-center t-fila tabular-nums" aria-live="polite">{cant}</span>
                      <button type="button" onClick={() => onSumar(m)} aria-label={`Añadir uno de ${m.nombre}`} className="size-10 rounded-xl flex items-center justify-center cursor-pointer hover:bg-muted"><Plus size={16} weight="bold" /></button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
