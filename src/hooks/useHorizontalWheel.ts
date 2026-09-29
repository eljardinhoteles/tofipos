import { useCallback, useRef } from 'react';

// En PC con mouse la rueda solo genera scroll vertical, así que una fila con
// overflow-x no se puede recorrer. Este hook devuelve un callback-ref que
// convierte la rueda vertical en scroll horizontal sobre esa fila (el trackpad
// y el táctil, que ya generan deltaX, no se tocan). Es un callback-ref porque
// la fila puede montarse y desmontarse (p. ej. al alternar con un input), y el
// listener debe ser no-pasivo para poder hacer preventDefault.
export function useHorizontalWheel() {
  const cleanupRef = useRef<(() => void) | null>(null);

  return useCallback((el: HTMLElement | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    cleanupRef.current = () => el.removeEventListener('wheel', onWheel);
  }, []);
}
