import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface PaginacionProps {
  page: number;
  totalPages: number;
  /** Total de registros (para "Mostrando x-y de n"). */
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
}

const botonClase = 'h-9 pointer-coarse:h-11 min-w-9 pointer-coarse:min-w-11 px-0 @md:px-4 flex items-center justify-center gap-1.5 rounded-full border border-border bg-card hover:bg-muted t-cuerpo-fuerte text-muted-foreground disabled:opacity-40 disabled:cursor-default transition-colors cursor-pointer';

/**
 * Paginador único de la app (Órdenes, Clientes, Centro de Ventas). Se adapta al ancho de su
 * contenedor, no de la pantalla: con poco espacio quedan flechas y "Página x de y" centrados;
 * con espacio, el texto de las flechas y el "Mostrando x-y de n" a la izquierda.
 */
export function Paginacion({ page, totalPages, total, pageSize, onPageChange, className }: PaginacionProps) {
  if (total === 0) return null;
  const desde = Math.min((page - 1) * pageSize + 1, total);
  const hasta = Math.min(page * pageSize, total);
  return (
    <nav aria-label="Paginación" className={cn('@container shrink-0 border-t border-border bg-card', className)}>
      <div className="flex items-center justify-center @lg:justify-between gap-3 px-3 @lg:px-6 py-3 @lg:py-4">
        <span className="hidden @lg:block t-meta text-muted-foreground tabular-nums">Mostrando {desde}-{hasta} de {total}</span>
        <div className="flex items-center gap-2">
          <button type="button" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}
            aria-label="Página anterior" className={botonClase}>
            <CaretLeft size={16} weight="bold" /><span className="hidden @md:inline">Anterior</span>
          </button>
          <span className="px-2 t-dato text-foreground tabular-nums whitespace-nowrap">Página {page} de {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            aria-label="Página siguiente" className={botonClase}>
            <span className="hidden @md:inline">Siguiente</span><CaretRight size={16} weight="bold" />
          </button>
        </div>
      </div>
    </nav>
  );
}
