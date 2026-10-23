import { useFeriados } from '../../lib/feriados';

/** Punto rojo en la esquina de una cabecera de día si esa fecha es feriado (el nombre sale al pasar el cursor). El contenedor debe ser `relative` o `sticky`. */
export function MarcaFeriado({ fecha, posicion = 'top-1.5 right-1.5' }: { fecha: string; posicion?: string }) {
  const nombre = useFeriados().nombreDe(fecha);
  if (!nombre) return null;
  return <span title={`Feriado: ${nombre}`} aria-label={`Feriado: ${nombre}`} className={`absolute ${posicion} size-2 rounded-full bg-destructive`} />;
}
