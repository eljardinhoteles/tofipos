import { useSyncExternalStore } from 'react';

// Experimento: menú móvil "en capas". Al abrirlo, la página baja y deja ver las
// tarjetas de los módulos sobre el fondo oscuro. Interruptor para volver al menú
// de panel inferior (Drawer) si el experimento no convence.
export const MENU_EN_CAPAS = true;

// Estado abierto/cerrado fuera de React/contexto: lo leen el layout, la barra
// inferior y la capa del menú sin re-renderizar todo lo que consume el UIContext.
let abierto = false;
const suscriptores = new Set<() => void>();

export function setMenuMovilAbierto(valor: boolean) {
  if (abierto === valor) return;
  abierto = valor;
  suscriptores.forEach(fn => fn());
}

export const toggleMenuMovil = () => setMenuMovilAbierto(!abierto);

export function useMenuMovilAbierto() {
  return useSyncExternalStore(
    (cb) => { suscriptores.add(cb); return () => { suscriptores.delete(cb); }; },
    () => abierto,
  );
}
