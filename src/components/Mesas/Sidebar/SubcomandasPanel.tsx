import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHorizontalWheel } from '../../../hooks/useHorizontalWheel';
import { Plus, Check, X, ListBullets, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { initVerticalRxDb } from '../../../db/rxdb';

interface SubcomandasPanelProps {
  subcomandas: any[];
  /** Ítems de todas las subcomandas de la mesa (los provee TableSidebar). */
  items: any[];
  activeId: string | null;
  vistaTodas: boolean;
  onSelect: (id: string) => void;
  onSelectTodas: () => void;
  onAdd: (nombre: string) => Promise<unknown>;
  onAddingChange?: (adding: boolean) => void;
}

// Mesa Múltiple: fila horizontal de mini cards (caben 4 en móvil, el resto se
// desliza). "Todas" muestra la mesa completa en una lista; tocar una
// subcomanda la activa — el sidebar de abajo (SidebarDetails) pasa a operar
// sobre esa comanda, con su footer de siempre.
export function SubcomandasPanel({ subcomandas, items, activeId, vistaTodas, onSelect, onSelectTodas, onAdd, onAddingChange }: SubcomandasPanelProps) {
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    onAddingChange?.(adding);
    return () => onAddingChange?.(false);
  }, [adding, onAddingChange]);
  const [text, setText] = useState('');
  const activeRef = useRef<HTMLButtonElement>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  // Rueda del mouse (PC) → scroll horizontal de la fila de pills.
  const wheelRef = useHorizontalWheel();
  const setRowRef = useCallback((el: HTMLDivElement | null) => {
    rowRef.current = el;
    wheelRef(el);
  }, [wheelRef]);

  // Flechas de desplazamiento (solo escritorio, donde con mouse no hay gesto
  // horizontal): aparecen en el lado hacia el que aún hay pills por ver.
  const [borde, setBorde] = useState({ izq: false, der: false });
  const scrollFila = (dir: -1 | 1) => {
    const row = rowRef.current;
    if (row) row.scrollBy({ left: dir * Math.max(160, row.clientWidth * 0.6), behavior: 'smooth' });
  };

  useEffect(() => {
    // Scroll manual solo dentro de la fila: scrollIntoView también desplaza
    // los ancestros y descuadraba el sidebar horizontalmente.
    const row = rowRef.current;
    const el = activeRef.current;
    if (!row || !el) return;
    const left = el.offsetLeft - row.offsetLeft;
    const right = left + el.offsetWidth;
    if (left < row.scrollLeft) row.scrollTo({ left: left - 12, behavior: 'smooth' });
    else if (right > row.scrollLeft + row.clientWidth) row.scrollTo({ left: right - row.clientWidth + 12, behavior: 'smooth' });
  }, [activeId, vistaTodas]);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const actualizar = () => {
      const izq = row.scrollLeft > 2;
      const der = row.scrollLeft + row.clientWidth < row.scrollWidth - 2;
      setBorde(prev => (prev.izq === izq && prev.der === der ? prev : { izq, der }));
    };
    actualizar();
    row.addEventListener('scroll', actualizar, { passive: true });
    const ro = new ResizeObserver(actualizar);
    ro.observe(row);
    return () => { row.removeEventListener('scroll', actualizar); ro.disconnect(); };
  }, [adding, subcomandas.length, vistaTodas]);

  const resumen = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) {
      if (it.anulado) continue;
      map.set(it.comanda_id, (map.get(it.comanda_id) ?? 0) + (it.cantidad || 0));
    }
    return map;
  }, [items]);

  // Nombres sugeridos al crear: habitaciones activas con su huésped (sirven
  // para luego cargar cada subcomanda a su habitación) y los siguientes
  // "Persona N". Se excluyen los nombres ya usados en esta mesa.
  const [habitaciones, setHabitaciones] = useState<string[]>([]);
  useEffect(() => {
    if (!adding) return;
    let alive = true;
    (async () => {
      const rxDb = await initVerticalRxDb();
      const [cuentas, mesas] = await Promise.all([
        rxDb.habitacion_cuentas.find({ selector: { estado: 'activa', _deleted: { $ne: true } } }).exec(),
        rxDb.mesas.find({ selector: { _deleted: { $ne: true } } }).exec(),
      ]);
      if (!alive) return;
      const mesaPorId = new Map(mesas.map((m: any) => [m.id, m.nombre as string]));
      const etiquetas = cuentas.map((c: any) => {
        const nombreMesa = mesaPorId.get(c.mesa_id) ?? '';
        const num = nombreMesa.match(/Hab\.\s*(\d+)/)?.[1];
        return `${num ? `Hab. ${num}` : nombreMesa}${c.huesped ? ` · ${c.huesped}` : ''}`.trim();
      }).filter(Boolean);
      setHabitaciones(etiquetas.sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })));
    })().catch(() => {});
    return () => { alive = false; };
  }, [adding]);

  const sugerencias = useMemo(() => {
    const usados = new Set(subcomandas.map(c => (c.subcomanda_nombre || '').trim().toLowerCase()));
    const personas: string[] = [];
    for (let n = subcomandas.length + 1; personas.length < 3 && n < subcomandas.length + 20; n++) {
      const nombre = `Persona ${n}`;
      if (!usados.has(nombre.toLowerCase())) personas.push(nombre);
    }
    return [...habitaciones, ...personas].filter(s => !usados.has(s.toLowerCase()));
  }, [habitaciones, subcomandas]);

  const closeEditor = () => { setAdding(false); setText(''); };

  const submit = async () => {
    const nombre = text.trim();
    if (!nombre) return;
    await onAdd(nombre);
    closeEditor();
  };

  const cardBase = 'shrink-0 basis-[calc((100%-1.5rem)/4)] h-12 rounded-full border px-3 flex flex-col items-center justify-center text-center cursor-pointer transition-colors relative';

  if (adding) {
    return (
      <div className="shrink-0 border-b border-border bg-primary/10 px-3 pt-5 pb-3 md:pt-3 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            placeholder="Persona o habitación (ej: Hab. 3)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') closeEditor();
            }}
            className="h-12 text-base"
          />
          <Button size="icon" className="h-12 w-12 shrink-0 rounded-xl" onClick={submit} disabled={!text.trim()} aria-label="Crear subcomanda">
            <Check size={22} weight="bold" />
          </Button>
          <Button size="icon" variant="ghost" className="h-12 w-12 shrink-0 rounded-xl" onClick={closeEditor} aria-label="Cancelar">
            <X size={22} weight="bold" />
          </Button>
        </div>

        {sugerencias.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sugeridos · toca para crear</span>
            <div className="flex flex-wrap gap-2">
              {sugerencias.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={async () => { await onAdd(s); closeEditor(); }}
                  className="h-11 px-4 rounded-full border border-border bg-card text-sm font-bold cursor-pointer active:scale-95 transition-transform"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative shrink-0 border-b border-border bg-primary/10 md:h-[72px]">
      {borde.izq && (
        <button
          type="button"
          aria-label="Ver subcomandas anteriores"
          onClick={() => scrollFila(-1)}
          className="hidden md:flex absolute left-1 top-[2.125rem] md:top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-card border border-border shadow items-center justify-center cursor-pointer active:scale-95"
        >
          <CaretLeft size={16} weight="bold" />
        </button>
      )}
      {borde.der && (
        <button
          type="button"
          aria-label="Ver más subcomandas"
          onClick={() => scrollFila(1)}
          className="hidden md:flex absolute right-1 top-[2.125rem] md:top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-card border border-border shadow items-center justify-center cursor-pointer active:scale-95"
        >
          <CaretRight size={16} weight="bold" />
        </button>
      )}
      <div ref={setRowRef} className="relative flex gap-2 overflow-x-auto overscroll-x-contain px-3 pt-5 pb-2.5 md:h-full md:items-center md:py-0 [scrollbar-width:none] md:[scrollbar-width:thin] [&::-webkit-scrollbar]:hidden md:[&::-webkit-scrollbar]:block md:[&::-webkit-scrollbar]:h-1.5 md:[&::-webkit-scrollbar-thumb]:rounded-full md:[&::-webkit-scrollbar-thumb]:bg-border">
        <button
          type="button"
          ref={vistaTodas ? activeRef : undefined}
          onClick={onSelectTodas}
          aria-label="Ver toda la mesa"
          className={cn(
            'shrink-0 w-12 h-12 rounded-full border flex items-center justify-center cursor-pointer transition-colors',
            vistaTodas ? 'border-primary bg-primary text-white' : 'border-border bg-card'
          )}
        >
          <ListBullets size={20} weight="bold" />
        </button>

        {subcomandas.map(c => {
          const isActive = !vistaTodas && c.id === activeId;
          const cantidad = resumen.get(c.id) ?? 0;
          // Cuenta pedida: la pill pasa a naranja (rellena si es la activa).
          const enCuenta = c.estado === 'cuenta';
          return (
            <button
              type="button"
              key={c.id}
              ref={isActive ? activeRef : undefined}
              onClick={() => onSelect(c.id)}
              className={cn(cardBase,
                enCuenta
                  ? (isActive ? 'border-warning bg-warning-foreground text-white' : 'border-warning bg-warning-soft text-warning-foreground')
                  : (isActive ? 'border-primary bg-primary text-white' : 'border-border bg-card'))}
            >
              <span className="w-full text-xs font-extrabold leading-tight truncate">{c.subcomanda_nombre}</span>
              <span className={cn('text-[10px] font-medium leading-tight',
                isActive ? 'text-white/80' : enCuenta ? 'text-warning-foreground' : 'text-muted-foreground')}>
                {cantidad} {cantidad === 1 ? 'item' : 'items'}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => { setAdding(true); setText(''); }}
          className={cn(cardBase, 'border-dashed border-border bg-transparent items-center text-muted-foreground')}
          aria-label="Agregar subcomanda"
        >
          <Plus size={18} weight="bold" />
        </button>
      </div>
    </div>
  );
}
