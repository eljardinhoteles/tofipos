import { useMemo } from 'react';
import { MagnifyingGlass, Check, X } from '@phosphor-icons/react';
import type { RxCliente } from '../../db/rxdb';
import { useRxClientes } from '../../hooks/useRxClientes';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { detalleCliente, clienteCoincide } from '../../lib/documentoCliente';

/**
 * Selector de cliente estándar del sistema: input de búsqueda por nombre o
 * DNI con resultados en vivo, cada uno mostrando "nombre + DNI". Se usa en
 * todos los flujos que vinculan un cliente (apertura de mesa, checkin de
 * habitación, etc.) para mantener la misma experiencia en todo el POS.
 */
interface ClienteSelectorProps {
  value: string;
  onChange: (nombre: string) => void;
  onSelect?: (cliente: RxCliente) => void;
  placeholder?: string;
  id?: string;
  className?: string;
  maxResults?: number;
  /** Color de la fila elegida: el de marca (por defecto) o azul en los flujos de hotel. */
  tono?: 'primary' | 'info';
}

export function ClienteSelector({
  value,
  onChange,
  onSelect,
  placeholder = 'Buscar o escribir cliente',
  id,
  className,
  maxResults = 8,
  tono = 'primary',
}: ClienteSelectorProps) {
  const { clientes } = useRxClientes();

  const searchResults = useMemo(() => {
    const term = value.trim().toLowerCase();
    if (!term) return [];
    return clientes
      .filter(c => clienteCoincide(c, term))
      .slice(0, maxResults);
  }, [value, clientes, maxResults]);

  const azul = tono === 'info';

  const handlePick = (cliente: RxCliente) => {
    onChange(cliente.nombre);
    onSelect?.(cliente);
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="relative">
        <MagnifyingGlass size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          id={id}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 pl-10 pr-12 text-base"
        />
        {value && (
          <button
            type="button"
            aria-label="Borrar búsqueda"
            onClick={() => onChange('')}
            className="absolute right-1 top-1/2 -translate-y-1/2 size-11 flex items-center justify-center rounded-2xl text-muted-foreground hover:text-foreground cursor-pointer touch-manipulation">
            <X size={16} weight="bold" />
          </button>
        )}
      </div>

      {value.trim() && searchResults.length > 0 && (
        <div className="flex flex-col gap-2">
          {searchResults.map(c => {
            const isSelected = c.nombre === value;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => handlePick(c)}
                className={cn(
                  'min-h-16 px-3 py-2 rounded-2xl border flex items-center gap-3 transition-colors cursor-pointer text-left touch-manipulation active:scale-[0.99]',
                  isSelected ? (azul ? 'border-info bg-info-soft ring-1 ring-info' : 'border-primary bg-primary/10 ring-1 ring-primary') : 'border-border bg-card hover:bg-muted/40'
                )}
              >
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <span className="t-fila text-foreground truncate">{c.nombre}</span>
                  <span className="t-meta text-muted-foreground truncate tabular-nums">
                    {detalleCliente(c)}
                  </span>
                </div>
                <span aria-hidden="true" className={cn('size-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                  isSelected ? (azul ? 'bg-info border-info text-white' : 'bg-primary border-primary text-primary-foreground') : 'border-border')}>
                  {isSelected && <Check size={16} weight="bold" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
