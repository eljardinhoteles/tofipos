import { useSyncExternalStore } from 'react';

// Estado "el sheet móvil terminó de subir". Vive fuera de React/contexto a propósito:
// solo MesasV2 lo lee, y así no se re-renderiza todo lo que consume el UIContext.
let listo = false;
const suscriptores = new Set<() => void>();

export function setSheetMovilListo(valor: boolean) {
  if (listo === valor) return;
  listo = valor;
  suscriptores.forEach(fn => fn());
}

export function useSheetMovilListo() {
  return useSyncExternalStore(
    (cb) => { suscriptores.add(cb); return () => { suscriptores.delete(cb); }; },
    () => listo,
  );
}
