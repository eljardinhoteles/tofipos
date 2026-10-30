import { useSyncExternalStore } from 'react';

// Hoja de zonas del celular: la barra inferior (que muestra la zona actual y la abre) y la pantalla de Mesas (que dibuja la
// hoja y sabe qué zona hay) se hablan por aquí, fuera de React, como `menuMovil`, para no re-renderizar nada más.
let abierta = false;
let etiqueta: string | null = null;
const suscriptores = new Set<() => void>();
const avisar = () => suscriptores.forEach((fn) => fn());
const suscribir = (cb: () => void) => { suscriptores.add(cb); return () => { suscriptores.delete(cb); }; };

export function setZonasAbiertas(valor: boolean) {
  if (abierta === valor) return;
  abierta = valor;
  avisar();
}

/** Nombre de la zona que se está viendo en Mesas; `null` cuando esa pantalla no está (la barra vuelve a su botón «Mesas»). */
export function setZonaEtiqueta(valor: string | null) {
  if (etiqueta === valor) return;
  etiqueta = valor;
  avisar();
}

export const useZonasAbiertas = () => useSyncExternalStore(suscribir, () => abierta);
export const useZonaEtiqueta = () => useSyncExternalStore(suscribir, () => etiqueta);
