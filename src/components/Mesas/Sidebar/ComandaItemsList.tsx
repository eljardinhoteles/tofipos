import { memo, useCallback, useEffect, useState, startTransition } from 'react';
import { Basket } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { ComandaItemRow } from './ComandaItemRow';
import { esParteRepartida } from '@/lib/reparto';
import { cantidadEnviada, parseSnapshot } from '@/lib/itemPendiente';

type Item = any;

interface FilaProps {
  item: Item;
  index: number;
  selected: boolean;
  locked: boolean;
  pendiente: boolean;
  onSelect: (item: Item) => void;
}

// Un ítem sin cambios no se vuelve a renderizar al abrir diálogos, escribir un
// motivo, etc.: el onClick se estabiliza aquí en vez de crearse en cada render.
const Fila = memo(function Fila({ item, index, selected, locked, pendiente, onSelect }: FilaProps) {
  const handleClick = useCallback(() => onSelect(item), [onSelect, item]);
  return <ComandaItemRow item={item} index={index} isSelected={selected} isLocked={locked} pendiente={pendiente} onClick={handleClick} />;
});

interface ComandaItemsListProps {
  items: Item[];
  selectedId?: string | null;
  /** Comanda ya confirmada a cocina y su fecha: define qué ítems están bloqueados. */
  confirmada?: boolean;
  confirmadaAt?: string | null;
  /** { item_id: cantidad } de la última confirmación: distingue unidades ya enviadas de las nuevas. */
  snapshot?: Record<string, number>;
  /** Espacio al final para que el pill "Añadir" flotante no tape el último ítem. */
  padBottom?: boolean;
  onSelect: (item: Item) => void;
}

// Un ítem queda bloqueado (no editable/borrable) cuando ya formaba parte del
// último lote confirmado a cocina. Un ítem anulado no cuenta como bloqueado.
const estaBloqueado = (item: Item, confirmada?: boolean, confirmadaAt?: string | null) =>
  (esParteRepartida(item) && !item?.anulado) ||
  !!confirmada && !!confirmadaAt && !!item?.created_at && item.created_at <= confirmadaAt && !item?.anulado;

// Unidades que cocina aún no recibió (ítem nuevo, o una unidad sumada a uno confirmado).
const EMPTY_SNAPSHOT: Record<string, number> = {};
const tienePendiente = (item: Item, confirmadaAt?: string | null, snapshot: Record<string, number> = EMPTY_SNAPSHOT) =>
  !item?.anulado && !esParteRepartida(item) && cantidadEnviada(item, confirmadaAt, snapshot) < item.cantidad;

// Comandas largas: se pintan primero las filas visibles y el resto entra en un
// segundo paso de baja prioridad, para que el sidebar abra sin esperar a todas.
const FILAS_INICIALES = 30;

export const ComandaItemsList = memo(function ComandaItemsList({ items, selectedId, confirmada, confirmadaAt, snapshot, padBottom, onSelect }: ComandaItemsListProps) {
  const [completa, setCompleta] = useState(items.length <= FILAS_INICIALES);
  useEffect(() => {
    if (completa) return;
    const t = setTimeout(() => startTransition(() => setCompleta(true)), 60);
    return () => clearTimeout(t);
  }, [completa]);
  const visibles = completa ? items : items.slice(0, FILAS_INICIALES);
  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-8">
        <Basket size={48} className="text-muted-foreground/40" />
        <span className="font-bold text-xs text-foreground">Comanda vacía</span>
        <span className="text-[11px] text-muted-foreground">Añade productos usando el menú.</span>
      </div>
    );
  }
  return (
    <div className={cn('flex flex-col', padBottom && 'pb-8')}>
      {visibles.map((item, index) => (
        <Fila
          key={item.id}
          item={item}
          index={index}
          selected={selectedId === item.id}
          locked={estaBloqueado(item, confirmada, confirmadaAt)}
          pendiente={tienePendiente(item, confirmada ? confirmadaAt : null, snapshot)}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
});

interface GrupoTodas {
  comanda: Item;
  items: Item[];
  total: number;
}

interface TodasListProps {
  grupos: GrupoTodas[];
  onSelectSubcomanda: (id: string) => void;
}

// Mesa Múltiple, vista "Todas": ítems de cada subcomanda bajo su cabecera.
export const TodasList = memo(function TodasList({ grupos, onSelectSubcomanda }: TodasListProps) {
  return (
    <div className="flex flex-col">
      {grupos.map(g => (
        <div key={g.comanda.id}>
          <button
            type="button"
            onClick={() => onSelectSubcomanda(g.comanda.id)}
            className="sticky top-0 z-10 w-full flex items-center justify-between px-4 py-2 bg-muted border-y border-border cursor-pointer"
          >
            <span className="font-extrabold text-xs uppercase tracking-wide text-foreground truncate">{g.comanda.subcomanda_nombre || g.comanda.cliente}</span>
            <span className="font-black text-xs text-foreground shrink-0">${g.total.toFixed(2)}</span>
          </button>
          {g.items.length === 0 ? (
            <div className="px-4 py-3 text-[11px] text-muted-foreground">Sin productos</div>
          ) : g.items.map((item, index) => (
            <TodasFila key={item.id} item={item} index={index} comanda={g.comanda} onSelectSubcomanda={onSelectSubcomanda} />
          ))}
        </div>
      ))}
    </div>
  );
});

const TodasFila = memo(function TodasFila({ item, index, comanda, onSelectSubcomanda }: { item: Item; index: number; comanda: Item; onSelectSubcomanda: (id: string) => void }) {
  const handleClick = useCallback(() => onSelectSubcomanda(comanda.id), [onSelectSubcomanda, comanda.id]);
  return (
    <ComandaItemRow
      item={item}
      index={index}
      isLocked={estaBloqueado(item, true, comanda.confirmada_at)}
      pendiente={tienePendiente(item, comanda.confirmada_at, parseSnapshot(comanda.cantidades_snapshot))}
      onClick={handleClick}
    />
  );
});
