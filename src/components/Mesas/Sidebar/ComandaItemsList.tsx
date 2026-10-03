import { memo, useCallback } from 'react';
import { Basket } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { ComandaItemRow } from './ComandaItemRow';

type Item = any;

interface FilaProps {
  item: Item;
  index: number;
  selected: boolean;
  locked: boolean;
  onSelect: (item: Item) => void;
}

// Un ítem sin cambios no se vuelve a renderizar al abrir diálogos, escribir un
// motivo, etc.: el onClick se estabiliza aquí en vez de crearse en cada render.
const Fila = memo(function Fila({ item, index, selected, locked, onSelect }: FilaProps) {
  const handleClick = useCallback(() => onSelect(item), [onSelect, item]);
  return <ComandaItemRow item={item} index={index} isSelected={selected} isLocked={locked} onClick={handleClick} />;
});

interface ComandaItemsListProps {
  items: Item[];
  selectedId?: string | null;
  /** Comanda ya confirmada a cocina y su fecha: define qué ítems están bloqueados. */
  confirmada?: boolean;
  confirmadaAt?: string | null;
  /** Espacio al final para que el pill "Añadir" flotante no tape el último ítem. */
  padBottom?: boolean;
  onSelect: (item: Item) => void;
}

// Un ítem queda bloqueado (no editable/borrable) cuando ya formaba parte del
// último lote confirmado a cocina. Un ítem anulado no cuenta como bloqueado.
const estaBloqueado = (item: Item, confirmada?: boolean, confirmadaAt?: string | null) =>
  !!confirmada && !!confirmadaAt && !!item?.created_at && item.created_at <= confirmadaAt && !item?.anulado;

export const ComandaItemsList = memo(function ComandaItemsList({ items, selectedId, confirmada, confirmadaAt, padBottom, onSelect }: ComandaItemsListProps) {
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
      {items.map((item, index) => (
        <Fila
          key={item.id}
          item={item}
          index={index}
          selected={selectedId === item.id}
          locked={estaBloqueado(item, confirmada, confirmadaAt)}
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
      onClick={handleClick}
    />
  );
});
