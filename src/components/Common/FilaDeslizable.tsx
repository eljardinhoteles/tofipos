import { useCallback, useEffect, useRef, useState } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { useHorizontalWheel } from '../../hooks/useHorizontalWheel';

interface FilaDeslizableProps {
  children: React.ReactNode;
  /** Clases de la fila que se desplaza (los hijos van dentro de ella). */
  className?: string;
  /** Nombre de lo que se desplaza, para las etiquetas de los botones (ej. "filtros"). */
  etiqueta?: string;
}

// Flecha sin forma de chip: un degradado que funde la fila con el fondo y el icono encima, para que no se confunda con un filtro.
const botonFlecha = 'absolute inset-y-0 z-10 w-12 pointer-coarse:w-14 flex items-center cursor-pointer text-muted-foreground hover:text-foreground transition-colors';

// Fila con scroll horizontal y botones para deslizarla a izquierda y derecha, que aparecen solo en el
// lado donde aún hay contenido por ver. Sirve en PC (sin gesto horizontal) y en pantallas pequeñas;
// además la rueda del mouse recorre la fila.
export function FilaDeslizable({ children, className, etiqueta = 'contenido' }: FilaDeslizableProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const wheelRef = useHorizontalWheel();
  const [borde, setBorde] = useState({ izq: false, der: false });

  const setRowRef = useCallback((el: HTMLDivElement | null) => {
    rowRef.current = el;
    wheelRef(el);
  }, [wheelRef]);

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
    // El contenido cambia (aparece «Limpiar», cambia un chip) sin que cambie la fila: también se observan los hijos.
    const ro = new ResizeObserver(actualizar);
    ro.observe(row);
    Array.from(row.children).forEach(c => ro.observe(c));
    return () => { row.removeEventListener('scroll', actualizar); ro.disconnect(); };
  }, [children]);

  const desplazar = (dir: -1 | 1) => {
    const row = rowRef.current;
    if (row) row.scrollBy({ left: dir * Math.max(160, row.clientWidth * 0.6), behavior: 'smooth' });
  };

  return (
    <div className="relative flex-1 min-w-0">
      {borde.izq && (
        <button type="button" aria-label={`Ver ${etiqueta} anteriores`} title="Deslizar a la izquierda"
          onClick={() => desplazar(-1)} className={cn(botonFlecha, 'left-0 justify-start bg-linear-to-r from-card from-55% to-transparent')}>
          <CaretLeft size={20} weight="bold" />
        </button>
      )}
      {borde.der && (
        <button type="button" aria-label={`Ver más ${etiqueta}`} title="Deslizar a la derecha"
          onClick={() => desplazar(1)} className={cn(botonFlecha, 'right-0 justify-end bg-linear-to-l from-card from-55% to-transparent')}>
          <CaretRight size={20} weight="bold" />
        </button>
      )}
      <div ref={setRowRef} className={cn('overflow-x-auto overscroll-x-contain hide-scrollbar', className)}>
        {children}
      </div>
    </div>
  );
}
