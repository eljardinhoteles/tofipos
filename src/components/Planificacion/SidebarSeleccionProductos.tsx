import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CaretRight, Check, MagnifyingGlass, SquaresFour, Tag } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { getCategoryIcon } from '@/lib/categoryIcons';
import { ReservaHeader } from '../Mesas/Sidebar/ReservaHeader';
import { useRxMenuCatalog } from '../../hooks/useRxMenuCatalog';
import { useAuth } from '../../context/AuthContext';
import { SidebarDiaConfirmado } from './SidebarDiaConfirmado';
import {
  usePlanificacion, useDestinoPlan, abrirDestino, agregarCelda, quitarCelda, confirmacionVigente, anularConfirmacion,
  type CeldaPlan, type EtiquetaPlan,
} from '../../lib/planificacion';

export type ProductoPlan = { id: string; nombre: string; categoria_nombre?: string; precio: number; activo?: boolean };

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const SIN_CATEGORIA = 'Sin categoría';

// Header del color de la etiqueta abierta: mismo vínculo visual que la celda marcada.
const TONO_HEADER = { warning: 'reserva', info: 'info', special: 'special', success: 'success', primary: 'primary', rose: 'rose', teal: 'teal', slate: 'slate' } as const;

interface Props {
  etiqueta: EtiquetaPlan;
  /** Texto del día, p. ej. "Hoy - Sábado · 10 oct". */
  diaTexto: string;
  productos: ProductoPlan[];
  categorias: Array<{ nombre: string; icono?: string | null }>;
  /** Productos ya puestos en esta celda (etiqueta + día). */
  celdas: CeldaPlan[];
  onAgregar: (productoId: string) => void;
  onQuitar: (celdaId: string) => void;
  onClose: () => void;
}

// Sidebar fijo a la derecha del planificador (no flotante): se abre al tocar una celda
// y sirve para buscar y marcar los productos de ese día y etiqueta. Primero muestra
// las categorías; la búsqueda recorre todas.
export function SidebarSeleccionProductos({ etiqueta, diaTexto, productos, categorias, celdas, onAgregar, onQuitar, onClose }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const buscadorRef = useRef<HTMLInputElement>(null);
  useEffect(() => { buscadorRef.current?.focus(); }, [etiqueta.id, diaTexto]);

  const celdaDe = useMemo(() => new Map(celdas.map((c) => [c.producto_id, c.id])), [celdas]);
  const buscando = busqueda.trim().length > 0;

  const visibles = useMemo(() => {
    const t = sinTildes(busqueda.trim());
    if (t) return productos.filter((p) => sinTildes(p.nombre).includes(t) || sinTildes(p.categoria_nombre || '').includes(t));
    if (categoria === null) return [];
    return productos.filter((p) => (p.categoria_nombre || SIN_CATEGORIA) === categoria);
  }, [productos, busqueda, categoria]);

  const listaCategorias = useMemo(() => {
    const conteo = new Map<string, { n: number; marcados: number }>();
    for (const p of productos) {
      const c = p.categoria_nombre || SIN_CATEGORIA;
      const v = conteo.get(c) ?? { n: 0, marcados: 0 };
      v.n += 1;
      if (celdaDe.has(p.id)) v.marcados += 1;
      conteo.set(c, v);
    }
    const orden = new Map(categorias.map((c, i) => [c.nombre, i]));
    const icono = new Map(categorias.map((c) => [c.nombre, getCategoryIcon(c.icono)]));
    return [...conteo.entries()]
      .map(([nombre, v]) => ({ nombre, ...v, Icono: icono.get(nombre) ?? SquaresFour }))
      .sort((a, b) => (orden.get(a.nombre) ?? 1e6) - (orden.get(b.nombre) ?? 1e6) || a.nombre.localeCompare(b.nombre, 'es'));
  }, [productos, categorias, celdaDe]);

  const alternar = (p: ProductoPlan) => {
    const celdaId = celdaDe.get(p.id);
    if (celdaId) onQuitar(celdaId); else onAgregar(p.id);
  };

  return (
    <div className="h-full w-full bg-card flex flex-col overflow-hidden">
      <ReservaHeader solido tono={TONO_HEADER[etiqueta.tono]} badge={<Tag size={20} weight="bold" />} titulo={etiqueta.nombre} subtitulo={diaTexto} onClose={onClose} />

      <div className="p-4 shrink-0 border-b border-border">
        <div className="relative">
          <MagnifyingGlass size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input ref={buscadorRef} value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar en todas las categorías…" aria-label="Buscar producto"
            className="h-12 w-full rounded-2xl bg-muted pl-10 pr-3 t-fila outline-none focus-visible:ring-2 focus-visible:ring-primary/30" />
        </div>
      </div>

      {!buscando && categoria !== null && (
        <button type="button" onClick={() => setCategoria(null)}
          className="shrink-0 min-h-14 flex items-center gap-2 px-4 py-3 border-b border-border text-left hover:bg-muted/60 active:bg-muted cursor-pointer transition-colors touch-manipulation">
          <ArrowLeft size={16} weight="bold" className="text-muted-foreground shrink-0" />
          <span className="flex-1 min-w-0 truncate t-titulo text-foreground">{categoria}</span>
          <span className="t-cuerpo-fuerte text-muted-foreground tabular-nums">{visibles.length}</span>
        </button>
      )}

      <main className="flex-1 min-h-0 overflow-y-auto">
        {!buscando && categoria === null ? (
          <ul className="flex flex-col">
            {listaCategorias.map(({ nombre, n, marcados, Icono }) => (
              <li key={nombre}>
                <button type="button" onClick={() => setCategoria(nombre)}
                  className="w-full min-h-16 text-left px-4 py-3 flex items-center gap-3.5 border-b border-border/60 hover:bg-muted/60 active:bg-muted cursor-pointer transition-colors touch-manipulation">
                  <span className="size-11 rounded-xl bg-muted text-foreground flex items-center justify-center shrink-0">
                    <Icono size={22} weight="bold" />
                  </span>
                  <span className="flex-1 min-w-0 truncate t-fila text-foreground">{nombre}</span>
                  {marcados > 0 && (
                    <span className="shrink-0 min-w-6 h-6 px-2 rounded-full bg-primary text-primary-foreground t-dato flex items-center justify-center tabular-nums">{marcados}</span>
                  )}
                  <span className="t-cuerpo-fuerte text-muted-foreground tabular-nums">{n}</span>
                  <CaretRight size={16} weight="bold" className="text-muted-foreground/60 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="flex flex-col">
            {visibles.length === 0 && <li className="px-4 py-8 text-center t-cuerpo text-muted-foreground">Sin resultados</li>}
            {visibles.map((p) => {
              const marcado = celdaDe.has(p.id);
              return (
                <li key={p.id}>
                  <button type="button" role="checkbox" aria-checked={marcado} onClick={() => alternar(p)}
                    className={cn('w-full min-h-16 text-left px-4 py-3 flex items-center gap-3 border-b border-border/60 cursor-pointer transition-colors touch-manipulation',
                      marcado ? 'bg-primary/10 hover:bg-primary/15 active:bg-primary/20' : 'hover:bg-muted/60 active:bg-muted')}>
                    <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 truncate t-fila text-foreground">{p.nombre}</span>
                        {p.activo === false && (
                          <span title="Inactivo: solo estará disponible en las fechas planificadas"
                            className="shrink-0 px-1.5 py-0.5 rounded-md bg-muted t-dato text-muted-foreground">Solo con plan</span>
                        )}
                      </span>
                      <span className="t-cuerpo text-muted-foreground truncate">
                        {buscando ? `${p.categoria_nombre || SIN_CATEGORIA} · ` : ''}${p.precio.toFixed(2)}
                      </span>
                    </span>
                    <span className={cn('size-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                      marcado ? 'bg-primary border-primary text-primary-foreground' : 'border-border')}>
                      {marcado && <Check size={16} weight="bold" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <footer className="p-4 border-t border-border bg-muted/40 flex items-center gap-3 shrink-0">
        <span className="flex-1 t-fila text-muted-foreground">
          {celdas.length === 0 ? 'Sin productos' : `${celdas.length} ${celdas.length === 1 ? 'producto' : 'productos'}`}
        </span>
        <Button type="button" onClick={onClose} className="h-14 px-10 t-fila touch-manipulation">Listo</Button>
      </footer>
    </div>
  );
}

/** Versión conectada para el sidebar derecho global (AppLayoutV2): lee la celda abierta y sus datos. */
export function SidebarPlanificacion() {
  const destino = useDestinoPlan();
  const { etiquetas, celdas, confirmaciones } = usePlanificacion();
  const { currentMesero, adminUser } = useAuth();
  const usuario = currentMesero?.nombre ?? adminUser?.email ?? 'Administrador';
  const { menuItems, categorias } = useRxMenuCatalog();
  const productos = useMemo<ProductoPlan[]>(
    () => [...menuItems].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base', numeric: true })),
    [menuItems],
  );
  const etiqueta = etiquetas.find((e) => e.id === destino?.etiqueta_id);
  if (!destino || !etiqueta) return null;
  // Día confirmado: resumen + datos de la firma (editar rompe la confirmación, los productos se conservan).
  const confirmacion = confirmacionVigente(confirmaciones, destino.fecha);
  if (confirmacion) {
    return (
      <SidebarDiaConfirmado
        fecha={destino.fecha}
        diaTexto={destino.diaTexto}
        confirmacion={confirmacion}
        etiquetas={etiquetas}
        celdas={celdas}
        nombreProducto={(id) => productos.find((p) => p.id === id)?.nombre ?? 'Producto eliminado'}
        onEditar={() => anularConfirmacion(destino.fecha, usuario)}
        onClose={() => abrirDestino(null)}
      />
    );
  }
  return (
    <SidebarSeleccionProductos
      etiqueta={etiqueta}
      diaTexto={destino.diaTexto}
      productos={productos}
      categorias={categorias}
      celdas={celdas.filter((c) => c.etiqueta_id === destino.etiqueta_id && c.fecha === destino.fecha)}
      onAgregar={(pid) => agregarCelda(pid, destino.fecha, destino.etiqueta_id)}
      onQuitar={quitarCelda}
      onClose={() => abrirDestino(null)}
    />
  );
}
