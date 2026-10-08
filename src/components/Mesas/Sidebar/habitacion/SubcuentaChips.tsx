import { cn } from '@/lib/utils';

interface SubcuentaChipsProps {
  subcuentas: Array<{ id: string; nombre: string }>;
  // null = cuenta principal; 'todas' (solo con mostrarTodas) = sin filtrar
  value: string | null;
  onChange: (id: string | null) => void;
  mostrarTodas?: boolean;
  // Nombre de la subcuenta principal (por defecto "Principal").
  nombrePrincipal?: string;
  className?: string;
}

// Selector de subcuenta de una habitación (Principal + las que se hayan
// creado, p. ej. las 2 familias de una villa).
export function SubcuentaChips({ subcuentas, value, onChange, mostrarTodas, nombrePrincipal = 'Principal', className }: SubcuentaChipsProps) {
  const opciones: Array<{ id: string | null; nombre: string }> = [
    ...(mostrarTodas ? [{ id: 'todas', nombre: 'Todas' }] : []),
    { id: null, nombre: nombrePrincipal },
    ...subcuentas,
  ];
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {opciones.map(o => {
        const activo = value === o.id;
        return (
          <button
            key={o.id ?? 'principal'}
            type="button"
            onClick={() => onChange(o.id)}
            className={cn(
              'h-10 px-4 rounded-full border text-sm font-bold cursor-pointer transition-colors active:scale-95',
              activo ? 'border-info bg-info text-white' : 'border-border bg-card text-foreground'
            )}
          >
            {o.nombre}
          </button>
        );
      })}
    </div>
  );
}
