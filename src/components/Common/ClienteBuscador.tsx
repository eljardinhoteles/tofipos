import { useMemo, useState } from 'react';
import { MagnifyingGlass, Check, X } from '@phosphor-icons/react';
import { useRxClientes } from '../../hooks/useRxClientes';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { detalleCliente, clienteCoincide } from '../../lib/documentoCliente';

interface ClienteBuscadorProps {
  /** id del cliente seleccionado ('' = ninguno) */
  value: string;
  onChange: (clienteId: string) => void;
  placeholder?: string;
  /** Clases extra del campo de búsqueda (p. ej. altura/tamaño de texto del formulario). */
  inputClassName?: string;
  maxResults?: number;
}

/**
 * Selecciona un cliente registrado por id. A diferencia de un <Select> con todos
 * los clientes, solo renderiza los primeros resultados de la búsqueda (con
 * debounce), mostrando nombre + número de identificación.
 */
export function ClienteBuscador({
  value,
  onChange,
  placeholder = 'Buscar por nombre o identificación',
  inputClassName,
  maxResults = 6,
}: ClienteBuscadorProps) {
  const { clientes } = useRxClientes();
  const [busqueda, setBusqueda] = useState('');
  const termino = useDebouncedValue(busqueda.trim().toLowerCase(), 250);

  const seleccionado = useMemo(
    () => (value ? clientes.find((c: any) => c.id === value) : null),
    [clientes, value]
  );

  const resultados = useMemo(() => {
    if (!termino) return [];
    const out: any[] = [];
    for (const c of clientes) {
      if (clienteCoincide(c, termino)) {
        out.push(c);
        if (out.length >= maxResults) break;
      }
    }
    return out;
  }, [termino, clientes, maxResults]);

  if (seleccionado) {
    return (
      <div className="p-2.5 rounded-2xl border border-ring ring-3 ring-ring/30 bg-input/50 flex items-center justify-between gap-2">
        <div className="flex flex-col min-w-0">
          <span className="font-medium text-sm text-foreground truncate">{seleccionado.nombre}</span>
          <span className="text-xs font-semibold text-muted-foreground truncate tabular-nums">
            {detalleCliente(seleccionado)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => { onChange(''); setBusqueda(''); }}
          className="text-muted-foreground cursor-pointer shrink-0"
          aria-label="Quitar cliente">
          <X size={14} weight="bold" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <MagnifyingGlass size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          placeholder={placeholder}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className={cn("pl-8", inputClassName)}
        />
      </div>

      {termino && resultados.length === 0 && (
        <span className="text-xs text-muted-foreground px-1">Sin resultados</span>
      )}

      {resultados.map((c: any) => (
        <button
          key={c.id}
          type="button"
          onClick={() => { onChange(c.id); setBusqueda(''); }}
          className={cn('p-2.5 rounded-2xl border border-transparent bg-input/50 flex items-center justify-between gap-2 transition-all cursor-pointer text-left')}>
          <div className="flex flex-col min-w-0">
            <span className="font-medium text-sm text-foreground truncate">{c.nombre}</span>
            <span className="text-xs font-semibold text-muted-foreground truncate tabular-nums">
              {detalleCliente(c)}
            </span>
          </div>
          <Check size={16} weight="bold" className="text-transparent shrink-0" />
        </button>
      ))}
    </div>
  );
}
