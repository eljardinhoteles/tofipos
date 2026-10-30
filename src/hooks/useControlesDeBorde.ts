import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Botones flotantes en los bordes izquierdo y derecho de un calendario (solo con ratón): aparecen al acercar el puntero al borde,
 * mueven la vista un paso por pulsación y, si se mantienen pulsados, siguen avanzando.
 * `inicio` es el ancho (px) de la columna fija de la izquierda: el borde izquierdo empieza donde ella termina.
 */
export function useControlesDeBorde(mover: (dir: 1 | -1) => void, inicio: number, zona = 56) {
  const [bordeCerca, setBordeCerca] = useState<'izq' | 'der' | null>(null);
  const moverRef = useRef(mover);
  useEffect(() => { moverRef.current = mover; });
  const repetir = useRef<{ espera?: number; ritmo?: number }>({});

  const soltar = useCallback(() => {
    window.clearTimeout(repetir.current.espera);
    window.clearInterval(repetir.current.ritmo);
    repetir.current = {};
  }, []);
  useEffect(() => soltar, [soltar]);

  const pulsar = (dir: 1 | -1) => {
    soltar();
    moverRef.current(dir);
    repetir.current.espera = window.setTimeout(() => {
      repetir.current.ritmo = window.setInterval(() => moverRef.current(dir), 350);
    }, 450);
  };

  const alMover = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    setBordeCerca(r.width - px <= zona ? 'der' : px >= inicio && px - inicio <= zona ? 'izq' : null);
  };

  const salir = () => { setBordeCerca(null); soltar(); };

  return { bordeCerca, pulsar, soltar, alMover, salir };
}
