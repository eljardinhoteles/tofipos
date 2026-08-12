import { useMemo } from 'react';
import { MagnifyingGlass, Check, X } from '@phosphor-icons/react';
import type { RxCliente } from '../../db/rxdb';
import { useRxClientes } from '../../hooks/useRxClientes';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

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
}

export function ClienteSelector({
  value,
  onChange,
  onSelect,
  placeholder = 'Buscar o escribir cliente',
  id,
  className,
  maxResults = 8,
}: ClienteSelectorProps) {
  const { clientes } = useRxClientes();

  const searchResults = useMemo(() => {
    const term = value.trim().toLowerCase();
    if (!term) return [];
    return clientes
      .filter(c => c.nombre?.toLowerCase().includes(term) || c.dni?.toLowerCase().includes(term))
      .slice(0, maxResults);
  }, [value, clientes, maxResults]);

  const handlePick = (cliente: RxCliente) => {
    onChange(cliente.nombre);
    onSelect?.(cliente);
  };

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="relative">
        <MagnifyingGlass size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          id={id}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pl-8"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground cursor-pointer">
            <X size={14} weight="bold" />
          </button>
        )}
      </div>

      {value.trim() && searchResults.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {searchResults.map(c => {
            const isSelected = c.nombre === value;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => handlePick(c)}
                className={cn(
                  'p-2.5 rounded-2xl border flex items-center justify-between gap-2 transition-all cursor-pointer text-left',
                  isSelected ? 'border-ring ring-3 ring-ring/30 bg-input/50' : 'border-transparent bg-input/50'
                )}
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-medium text-sm text-foreground truncate">{c.nombre}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {c.dni ? `DNI: ${c.dni}` : (c.telefono || c.email || 'Sin documento')}
                  </span>
                </div>
                {isSelected && (
                  <Check size={16} weight="bold" className="text-primary shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
